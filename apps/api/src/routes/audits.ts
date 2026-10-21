/**
 * /api/v1/audits — create and fetch audit jobs.
 *
 * Contract (v0.1.0-rc.3 — async):
 *   1. Client POSTs { repoUrl, mode, target, outputLanguage, includeLaunchCopy }.
 *   2. Server validates input.
 *   3. Server checks for X-PAYMENT (or for an Idempotency-Key header) and
 *      dedupes by paymentId / idempotency key.
 *   4. If no payment: server returns 402 with a payment challenge.
 *   5. If payment: server verifies it, creates a `queued` job, enqueues it
 *      via the configured AuditQueue adapter (Inline or PgBoss), and
 *      returns 202 with `Location: /api/v1/audits/:jobId` and
 *      `Retry-After: 1`.
 *   6. Client polls `GET /api/v1/audits/:jobId` until status is
 *      `completed` or `failed`.
 *      - `queued` / `processing`: returns 202 + Retry-After: 1
 *      - `completed`:               returns 200 + report + cache metadata
 *      - `failed`:                  returns 200 + structured error info
 *
 * Idempotency:
 *   - If a request comes in with an `Idempotency-Key` header that
 *     matches an existing job, the same jobId is returned and the job
 *     is NOT re-enqueued.
 *   - If a request comes in with `X-PAYMENT` whose paymentId matches an
 *     existing job, the same jobId is reused. This makes safe client
 *     retries cheap.
 *
 * Cache:
 *   - The AuditWorker, NOT this route, consults the report cache. The
 *     worker uses the same cache service as the rest of the system.
 *
 * Payment is verified BEFORE the job is enqueued; the worker never sees
 * a payment header and never charges the buyer.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateAuditInputSchema,
  ReportSchema,
  MetadataAnalyzer,
  parseRepoUrl,
  type CreateAuditInput,
  type Report,
} from '@repopilot/core';
import { priceFor, type PaymentConfig } from '@repopilot/okx-adapter';
import { sendError, HttpError } from '../utils/errors.js';
import type { JobService } from '../services/job-service.js';
import type { CacheService } from '../services/cache-service.js';
import type { AuditQueue } from '../queue/audit-queue.js';

const POLL_AFTER_MS = 1000;

/** Plain GitHub path segments. Anything else is rejected before a URL is built. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Is this the same request, for the purpose of reusing an `Idempotency-Key`?
 *
 * The key names a request, not a caller — there is no identity in this flow to
 * bind it to. So "same key" only means "retry" when the body agrees, and the
 * body is compared here rather than trusted.
 *
 * `repoUrl` is normalised before comparison because a retry is allowed to
 * differ in trivia: a trailing slash, surrounding whitespace, and the case of
 * the owner and repo all name the same repository. Everything else is compared
 * exactly — `mode`, `target` and `outputLanguage` change what is produced, and
 * a key that spanned two different products would be the defect this exists to
 * prevent.
 */
function sameRequest(prior: CreateAuditInput, next: CreateAuditInput): boolean {
  const normUrl = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
  return (
    normUrl(prior.repoUrl) === normUrl(next.repoUrl) &&
    prior.mode === next.mode &&
    prior.target === next.target &&
    prior.outputLanguage === next.outputLanguage &&
    Boolean(prior.includeLaunchCopy) === Boolean(next.includeLaunchCopy)
  );
}

export interface AuditRoutesDeps {
  service: JobService;
  payment: PaymentConfig;
  cache: CacheService;
  cacheEnabled: boolean;
  queue: AuditQueue;
  /** GitHub token used to look up the head SHA. Optional. */
  githubToken?: string;
  /** Default branch resolution cache; injected so the analyzer is reused. */
  metadataAnalyzer: MetadataAnalyzer;
  /** Allowed hosts for the repoUrl (SSRF defense). */
  allowedHosts: string[];
  /** Optional logger. */
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

/**
 * Extracting the `paymentId` from an `X-PAYMENT` header used to happen here.
 *
 * It was a second parser for the same wire format the adapter already parses,
 * and the two drifted: this one looked for `paymentId` at the top level of the
 * envelope while `ParsedPaymentHeader` declares it at `payload.paymentId`. In
 * `PAYMENT_MODE=okx` every buyer following the documented flow was answered
 * `400 X-PAYMENT header is malformed` before the adapter was consulted — the
 * paid endpoint could not accept a payment. No test caught it because every
 * payment test runs in mock mode, where the header is the plain string
 * `mock:<id>` and both parsers agree.
 *
 * The format now has one owner: `PaymentAdapter.readPaymentId`. See R-39.
 */

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps) {
  app.post('/api/v1/audits', async (req, reply) => {
    const parsed = CreateAuditInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        reply,
        new HttpError({
          statusCode: 400,
          code: 'INVALID_INPUT',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        }),
      );
    }
    return handleCreate(req, reply, parsed.data);
  });

  /**
   * Re-audit a repository using coordinates the caller already has.
   *
   * This is deliberately the SAME code path as `POST /api/v1/audits` —
   * same payment challenge, same idempotency keys, same queue. It exists
   * so an agent (or the Web UI) can close the loop — fix, re-audit,
   * compare — without re-typing the URL.
   *
   * Paid: it runs the pipeline again. The derived read-only views
   * (fix-plan / diff / history) are the free half of the same loop.
   */
  app.post<{ Params: { owner: string; repo: string } }>(
    '/api/v1/repositories/:owner/:repo/reaudit',
    async (req, reply) => {
      const { owner, repo } = req.params;
      if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
        return sendError(
          reply,
          new HttpError({
            statusCode: 400,
            code: 'INVALID_INPUT',
            message: 'owner and repo must be plain GitHub path segments',
          }),
        );
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const parsed = CreateAuditInputSchema.safeParse({
        repoUrl: `https://github.com/${owner}/${repo}`,
        // `full`, matching `CreateAuditInputSchema`'s own default and the MCP
        // tool. It said `quick` until 2026-10-09: R-37 moved every default to
        // `full` and missed this call site, so the same re-audit reached over
        // HTTP and over MCP asked for different reports, and the HTTP one was
        // the cheaper — the paid tier not delivering what the listing sells.
        // Every other field here already mirrors the schema.
        mode: body['mode'] ?? 'full',
        target: body['target'] ?? 'open_source',
        outputLanguage: body['outputLanguage'] ?? 'en',
        includeLaunchCopy: body['includeLaunchCopy'] ?? true,
      });
      if (!parsed.success) {
        return sendError(
          reply,
          new HttpError({
            statusCode: 400,
            code: 'INVALID_INPUT',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          }),
        );
      }
      // The constructed URL still passes through `parseRepoUrl` inside
      // `handleCreateAudit`, so the host allow-list applies here too.
      return handleCreate(req, reply, parsed.data);
    }
  );

  /**
   * Shared create-or-replay path for a paid audit.
   *
   * A closure rather than a module-level function, so both POST routes
   * and the GET below stay in one readable block and `deps` does not
   * have to be threaded through by hand.
   *
   * `POST /audits` and `POST /repositories/:owner/:repo/reaudit` share
   * this so they cannot drift apart: payment verification, idempotency,
   * head-SHA resolution and enqueueing happen exactly once, in one place.
   */
  const handleCreate = async (
    req: FastifyRequest,
    reply: FastifyReply,
    input: CreateAuditInput,
  ): Promise<unknown> => {
    // Idempotency-Key: if the client supplies one and it matches an
    // existing job, return the same jobId without creating new state.
    const idempotencyKey = (
      (req.headers['idempotency-key'] ?? req.headers['Idempotency-Key']) as string | undefined
    )?.trim() || null;

    // X-PAYMENT: indicates the buyer already paid.
    const xPayment = (req.headers['x-payment'] ?? req.headers['X-PAYMENT']) as string | undefined;
    // The adapter owns the header format, so it reads the id out of it. One
    // fetch, used by all three sites below.
    const adapter = deps.service.getPaymentAdapter();

    // 1. Try to find an existing job.
    let job = null as null | Awaited<ReturnType<typeof deps.service.getByPaymentId>>;
    if (idempotencyKey) {
      const byKey = await deps.service.getByIdempotencyKey(idempotencyKey);
      if (byKey) {
        // The key is a client-chosen string in a global namespace: nothing
        // binds it to a caller, so the only thing that can bind it to *this*
        // request is the request itself. A key reused with a different body
        // used to return the earlier job — pay for B, get A's jobId, and then
        // read A's report through the poll endpoint. Rejecting the mismatch is
        // also what keeps the unique index from turning it into a 500: `create`
        // would collide on `idempotency_key` and surface as an internal error.
        if (!sameRequest(byKey.input, input)) {
          return sendError(
            reply,
            new HttpError({
              statusCode: 409,
              code: 'IDEMPOTENCY_KEY_REUSED',
              message:
                'This Idempotency-Key was already used for a different request. ' +
                'Use a new key for a new audit, or resend the original request.',
            })
          );
        }
        job = byKey;
      }
    }
    if (!job && xPayment) {
      const priorPaymentId = adapter.readPaymentId(xPayment);
      if (priorPaymentId) {
        const byPayment = await deps.service.getByPaymentId(priorPaymentId);
        if (byPayment) job = byPayment;
      }
    }
    // Existing job short-circuits — but only with proof of payment.
    //
    // An idempotency key is chosen by the client and binds to nothing: it is
    // not an identity, and knowing one is not evidence of having paid for the
    // job it names. The `X-PAYMENT` header is the only credential this flow
    // issues, so it is the one that gates this path. (R-46.)
    //
    // And the proof has to be a *verification*, not a parse. This branch used
    // to compare `readPaymentId(xPayment)` — which only reads the header, and
    // does not check a signature, a `from`, an amount, a time window or a
    // nonce — against `job.paymentId`. Since `job.paymentId` is the value the
    // 402 response body itself discloses (`payment.paymentId` below), the gate
    // reduced to "the caller knows a string this service hands out": an
    // envelope with `signature: "0x00"` and the right `payload.paymentId`
    // returned a paid report for nothing. A paymentId names a payment; it is
    // not evidence of one.
    if (job && job.status === 'completed' && job.report) {
      if (xPayment) {
        const replayed = await adapter.verifyPayment({
          paymentId: job.paymentId ?? '',
          rawHeader: xPayment,
        });
        if (replayed.status === 'completed') {
          return reply.send({
            jobId: job.jobId,
            status: 'completed',
            report: ReportSchema.parse(job.report),
          });
        }
      }
      // No proof. Re-quote the job the key named rather than creating a second
      // one under the same key (which the unique index would refuse) and
      // rather than discarding the key (which would silently change what the
      // caller asked for). The challenge is attached to the completed row on
      // purpose: the next POST with its X-PAYMENT matches `job.paymentId`
      // and delivers the report, so a buyer who pays this challenge gets an
      // answer instead of a 402 loop. The row's status is reported truthfully
      // — it is completed; what the caller has not shown is payment for it.
      const price = priceFor(deps.payment);
      const challenge = await adapter.createChallenge({ quote: { ...price, mode: input.mode } });
      await deps.service.attachPayment(job, challenge.paymentId);
      return reply.status(402).send({
        jobId: job.jobId,
        status: job.status,
        payment: {
          paymentId: challenge.paymentId,
          mode: deps.payment.mode,
          amount: price.amount,
          currency: price.currency,
          challenge: challenge.challenge,
          expiresAt: challenge.expiresAt,
        },
        nextAction:
          deps.payment.mode === 'mock'
            ? `Replay this POST with header X-PAYMENT: mock:${challenge.paymentId}`
            : 'Sign with onchainos payment pay --payment-id <id> --yes, then replay with X-PAYMENT: <base64 envelope>',
      });
    }
    // For `queued` / `processing` jobs we do NOT short-circuit if the
    // client is supplying payment right now: the first POST (the
    // 402 path) does not enqueue, so the second POST (X-PAYMENT
    // replay) must enqueue. We detect this by `xPayment` being
    // present — the client is actively trying to settle.
    const isSettling = Boolean(xPayment);
    if (job && (job.status === 'queued' || job.status === 'processing') && !isSettling) {
      reply.header('Retry-After', '1');
      reply.header('Location', `/api/v1/audits/${job.jobId}`);
      return reply.status(202).send({
        jobId: job.jobId,
        status: job.status,
        statusUrl: `/api/v1/audits/${job.jobId}`,
        pollAfterMs: POLL_AFTER_MS,
      });
    }

    // 2. Validate the repoUrl host early so we don't 402 a clearly
    //    unsafe request.
    let parsedRepo: { owner: string; repo: string };
    try {
      parsedRepo = parseRepoUrl(input.repoUrl, deps.allowedHosts);
    } catch {
      return sendError(
        reply,
        new HttpError({ statusCode: 400, code: 'HOST_NOT_ALLOWED', message: 'repoUrl host is not in the allow-list' }),
      );
    }

    // 3. If no X-PAYMENT, return 402 with a challenge. We do NOT
    //    enqueue a job until payment is verified.
    if (!xPayment) {
      // We still need a jobId to attach the challenge to so the
      // client can safely retry with X-PAYMENT and reuse the same
      // jobId. We create the queued job WITHOUT a paymentId and
      // attach it on the second POST.
      const { job: queued, created } = await deps.service.create(input, idempotencyKey, parsedRepo);
      if (!created) {
        // A concurrent request with the same Idempotency-Key inserted first
        // (R-66). Its row already carries a challenge, and quoting a second one
        // onto the same job would invalidate the first client's payment proof —
        // so this answers exactly as if the job had been found at step 1: 202
        // and the status URL. The caller polls; the winner's 402 has the
        // challenge.
        reply.header('Retry-After', '1');
        reply.header('Location', `/api/v1/audits/${queued.jobId}`);
        return reply.status(202).send({
          jobId: queued.jobId,
          status: queued.status,
          statusUrl: `/api/v1/audits/${queued.jobId}`,
          pollAfterMs: POLL_AFTER_MS,
        });
      }
      const price = priceFor(deps.payment);
      // No `quoteKey`: each POST gets its own challenge and its own paymentId,
      // which is what `jobs.payment_id` being UNIQUE requires (D-011).
      const challenge = await adapter.createChallenge({
        quote: { ...price, mode: input.mode },
      });
      await deps.service.attachPayment(queued, challenge.paymentId);
      return reply.status(402).send({
        jobId: queued.jobId,
        status: 'queued',
        payment: {
          paymentId: challenge.paymentId,
          mode: deps.payment.mode,
          amount: price.amount,
          currency: price.currency,
          challenge: challenge.challenge,
          expiresAt: challenge.expiresAt,
        },
        nextAction:
          deps.payment.mode === 'mock'
            ? `Replay this POST with header X-PAYMENT: mock:${challenge.paymentId}`
            : 'Sign with onchainos payment pay --payment-id <id> --yes, then replay with X-PAYMENT: <base64 envelope>',
      });
    }

    // 4. Payment is present. Verify it.
    const priorPaymentId = adapter.readPaymentId(xPayment);
    if (!priorPaymentId) {
      return sendError(
        reply,
        new HttpError({ statusCode: 400, code: 'INVALID_INPUT', message: 'X-PAYMENT header is malformed' }),
      );
    }
    const receipt = await adapter.verifyPayment({
      paymentId: priorPaymentId,
      rawHeader: xPayment,
    });
    if (receipt.status !== 'completed') {
      return reply.status(402).send({
        error: { code: 'PAYMENT_NOT_SETTLED', message: 'Payment not yet settled', payment: receipt },
        paymentId: priorPaymentId,
      });
    }

    // 5. Payment verified. Create (or reuse) the queued job and enqueue.
    if (!job) {
      // A lost idempotency race is not an error here either: the winner's row
      // is the job, and this request's payment is attached to it below.
      job = (await deps.service.create(input, idempotencyKey, parsedRepo)).job;
    }
    if (job.paymentId !== priorPaymentId) {
      await deps.service.attachPayment(job, priorPaymentId);
    }
    // Resolve the head SHA up front and record it on the row.
    //
    // The worker re-resolves its own for the cache key, on purpose, so a
    // job re-delivered hours later is keyed on the commit that is
    // current then. This value is the one the caller was quoted, and it
    // is what the derived views report.
    // Resolve the head SHA through the repository's default branch.
    //
    // This used to try `main`, then `master`. Both are conventions, not
    // guarantees, so a repository defaulted to `develop`, `trunk` or `v1`
    // recorded `null` here while the worker's own cache key collapsed onto a
    // constant — see `AuditWorker.executeWithCache`. One resolution, one
    // meaning: `null` means GitHub could not be reached, and is not
    // interchangeable with a sentinel string, because the column is nullable
    // and the derived views report it verbatim.
    const branch = await deps.metadataAnalyzer.getDefaultBranch(parsedRepo.owner, parsedRepo.repo);
    const headSha = branch
      ? await deps.metadataAnalyzer
          .getHeadSha(parsedRepo.owner, parsedRepo.repo, branch)
          .catch(() => null)
      : null;
    await deps.service.setCommitSha(job, headSha);

    // Enqueue. If the queue is shutting down, tell the client via 503 so it
    // can retry.
    //
    // The row is deliberately left `queued` and the thrown message is
    // deliberately not stored. Both were wrong in the same statement (R-75):
    //
    //   - `failed` is terminal, and the worker claims on
    //     `expectedStatus: 'queued'`. So the retry this 503 asks for — the
    //     client replaying the same POST with the same Idempotency-Key and
    //     X-PAYMENT — found the row it had just created, attached the payment,
    //     enqueued it, and the job could never be claimed. The one recovery
    //     the response named was the one the write made impossible. The inline
    //     driver already decided this for the same situation, in
    //     `runJob`'s comment: a job that never reached the worker stays
    //     `queued`, "which is true".
    //
    //   - `service.fail(job, 'ENQUEUE_FAILED', msg)` wrote the queue's own
    //     error text into the caller-visible `error` column, which is the
    //     disclosure R-65 closed on the worker's path — the same door, the
    //     other side. The message goes to the log, keyed by `jobId`, and
    //     nowhere else.
    let enqueueResult;
    try {
      enqueueResult = await deps.queue.enqueue({ jobId: job.jobId });
    } catch (err) {
      deps.log?.warn(
        { jobId: job.jobId, err: (err as Error)?.message ?? 'unknown' },
        'enqueue failed; job left queued for the client to retry',
      );
      return reply.status(503).send({
        error: { code: 'ENQUEUE_FAILED', message: 'Queue is not accepting jobs; please retry' },
        jobId: job.jobId,
      });
    }
    if (!enqueueResult.accepted) {
      // The queue already has this job; that's fine, the existing
      // worker call will satisfy it.
      deps.log?.info({ jobId: job.jobId }, 'queue dedup hit; not re-enqueuing');
    }

    reply.header('Retry-After', '1');
    reply.header('Location', `/api/v1/audits/${job.jobId}`);
    return reply.status(202).send({
      jobId: job.jobId,
      status: 'queued',
      statusUrl: `/api/v1/audits/${job.jobId}`,
      pollAfterMs: POLL_AFTER_MS,
    });
  };

  app.get('/api/v1/audits/:jobId', async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const job = await deps.service.get(req.params.jobId);
    if (!job) {
      return sendError(reply, new HttpError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'No such job' }));
    }
    if (job.status === 'queued' || job.status === 'processing') {
      reply.header('Retry-After', '1');
      return reply.status(202).send({
        jobId: job.jobId,
        status: job.status,
        statusUrl: `/api/v1/audits/${job.jobId}`,
        pollAfterMs: POLL_AFTER_MS,
        createdAt: job.createdAt,
      });
    }
    if (job.status === 'failed') {
      // We return 200 with a structured `error` envelope rather than
      // 5xx, so a failed job is observable but does not look like a
      // server outage. Clients that prefer a 5xx can switch on
      // `status === 'failed'`.
      return reply.send({
        jobId: job.jobId,
        status: 'failed',
        error: {
          code: job.errorCode ?? 'INTERNAL',
          message: job.error ?? 'audit failed',
        },
        createdAt: job.createdAt,
        failedAt: job.failedAt,
      });
    }
    // completed
    return reply.send({
      jobId: job.jobId,
      status: 'completed',
      report: job.report ? ReportSchema.parse(job.report as Report) : null,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      cache: job.cache ?? { hit: false, keyVersion: 'v1', expiresAt: null },
    });
  });
}
