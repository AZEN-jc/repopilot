/**
 * AuditWorker — single audit-job executor.
 *
 * This is the ONE place that knows how to:
 *   - load a job by id
 *   - transition the state machine
 *     queued     -> processing  (guarded by `expectedStatus: 'queued'`)
 *     processing -> completed   (only if report stored)
 *     processing -> queued      (retryable failure, and an attempt left to spend)
 *     processing -> failed      (terminal: permanent, or out of attempts)
 *   - run the audit pipeline through the existing Report Cache
 *   - classify errors (transient vs permanent) and decide whether another
 *     attempt is worth asking the queue for
 *
 * The worker does NOT verify payment (that happens in the route,
 * before the job is ever enqueued) and does NOT instantiate the
 * pipeline (the host provides it).
 *
 * === THE CONTRACT WITH THE QUEUE =======================================
 * A single call to `runOnce` is a single attempt. It reports "another attempt
 * is warranted" the only way a queue can hear it — by throwing — and it stops
 * asking once the configured budget is spent, writing the terminal state
 * itself instead. Two consequences the drivers depend on:
 *
 *   - A retryable failure must leave the row in a state a retry can *claim*,
 *     which is `queued` and not `processing`: `runOnce` skips a job it finds in
 *     `processing`, so a row parked there silently swallows the redelivery that
 *     was supposed to follow. (R-43 — both drivers had this.)
 *   - The terminal decision lives here rather than in the drivers, because only
 *     the row knows how many attempts it has had, and pg-boss cannot tell the
 *     handler anything the row does not already say.
 */
import {
  AuditPipeline,
  MetadataAnalyzer,
  REPORT_VERSION,
  ReportSchema,
  parseRepoUrl,
  type AuditJob,
  type Report,
} from '@repopilot/core';
import type { CacheService } from './cache-service.js';
import type { JobRepository } from '../repositories/job-repository.js';

export type AuditErrorCode =
  | 'INVALID_INPUT'
  | 'HOST_NOT_ALLOWED'
  | 'REPO_NOT_FOUND'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'JOB_TIMEOUT'
  | 'INTERNAL';

/**
 * Raised when an attempt outlives `AUDIT_QUEUE_JOB_TIMEOUT_MS`.
 *
 * Retryable, because a slow network is not a permanent failure — but a code of
 * its own rather than `UPSTREAM_FAILED`, because the two point at different
 * things. `UPSTREAM_FAILED` is a report about the upstream; this is a report
 * about us giving up on waiting for it. Collapsing them would make a hung
 * request indistinguishable from a rejected one in the job row, and those want
 * different responses.
 *
 * Safe to add: a job's `errorCode` is a free string on the wire
 * (`JobStatusSchema`/`AuditJobSchema` type it as `z.string()`), unlike the
 * HTTP error envelope in `docs/API.md`, which is a closed enum.
 */
export const JOB_TIMEOUT = 'JOB_TIMEOUT' as const;

export class AuditError extends Error {
  readonly code: AuditErrorCode;
  readonly retryable: boolean;
  constructor(code: AuditErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AuditWorkerDeps {
  repo: JobRepository;
  pipeline: AuditPipeline;
  cache: CacheService;
  cacheEnabled: boolean;
  /** Metadata analyzer used to resolve the head SHA for the cache key. */
  metadataAnalyzer: MetadataAnalyzer;
  /** Allowed hosts for the repoUrl (SSRF defense). */
  allowedHosts: string[];
  /**
   * How many times a failed attempt may be re-attempted, after the first one.
   * `AUDIT_QUEUE_RETRY_LIMIT`; pg-boss is configured with the same number, so
   * both drivers make the same number of attempts.
   */
  retryLimit: number;
  /**
   * How long one attempt may take before it is abandoned and reported as
   * `JOB_TIMEOUT`. `AUDIT_QUEUE_JOB_TIMEOUT_MS`.
   */
  jobTimeoutMs: number;
  /**
   * How long a row may sit in `processing` before another worker treats it as
   * abandoned and takes it over. Set from the queue's own redelivery bound
   * (`PgBossAuditQueue`'s `expireInSeconds`), so the reclaim never races the
   * expiry that is supposed to free the job in the first place.
   *
   * Without it a worker that dies mid-attempt parks the row in `processing`
   * for good: `runOnce` skips a row it finds there, and the redelivery that
   * arrives afterwards is therefore dropped on the floor. The buyer has paid
   * and polls a 202 forever. (R-44.)
   */
  staleProcessingMs: number;
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export class AuditWorker {
  constructor(private readonly deps: AuditWorkerDeps) {}

  /**
   * Run a single attempt at an audit job.
   *
   * Returns void when the job reached a terminal state — `completed` or
   * `failed` alike, so a caller must not read "did not throw" as "succeeded".
   * Throws `AuditError` only to ask for another attempt, which it does solely
   * while `attempts` is still under `retryLimit + 1`; a permanent failure, or
   * one that has run out of attempts, is written as `failed` and returns.
   *
   * Idempotency: if the job is already `completed` or `failed`, we
   * return without re-running. If a second worker somehow transitions
   * the same job to `processing`, the conditional update returns
   * `updated: false` and we treat the job as already taken.
   */
  async runOnce(jobId: string): Promise<void> {
    const log = this.deps.log ?? { info: () => undefined, warn: () => undefined, error: () => undefined };
    let job = await this.deps.repo.findById(jobId);
    if (!job) {
      log.warn({ jobId }, 'audit job not found; skipping');
      return;
    }
    if (job.status === 'completed') {
      log.info({ jobId }, 'audit job already completed; idempotent skip');
      return;
    }
    if (job.status === 'failed') {
      log.info({ jobId }, 'audit job already failed; not re-running');
      return;
    }
    if (job.status === 'processing') {
      // Another worker may be running this — or the last one may have died
      // holding it. `startedAt` is the only thing that tells the two apart.
      //
      // A row parked in `processing` is otherwise a dead end: the guard below
      // treats it as "someone else has it", so the redelivery that was
      // supposed to follow the crash is dropped and the job polls 202 forever
      // (R-44). Reclaiming it costs one guarded write and cannot double-run:
      // if a live worker is mid-attempt it is younger than this bound by
      // definition — the bound is the queue's redelivery window, which is
      // longer than one attempt may take.
      const startedAt = job.startedAt ? Date.parse(job.startedAt) : Number.NaN;
      const ageMs = Number.isFinite(startedAt) ? Date.now() - startedAt : Number.POSITIVE_INFINITY;
      if (ageMs <= this.deps.staleProcessingMs) {
        log.warn({ jobId }, 'audit job already processing elsewhere; skipping');
        return;
      }
      log.warn({ jobId, ageMs }, 'audit job stuck in processing; reclaiming');
      const reclaimed = await this.deps.repo.update(
        jobId,
        {
          status: 'queued',
          errorCode: 'JOB_TIMEOUT',
          error: `previous attempt did not finish within ${this.deps.staleProcessingMs}ms; reclaimed`,
        },
        'processing',
      );
      if (!reclaimed.updated) {
        // Someone else got there first — a live worker claiming it, or
        // another reclaim winning the race. Either way, not ours.
        log.info({ jobId }, 'audit job claim lost; skipping');
        return;
      }
      // Fall through: the row is `queued` now and the guarded take below is
      // the normal claim path. Re-read it first — the attempt count has to
      // come from the row we just reclaimed, not from the object loaded at
      // the top of this call. The crashed attempt *was* counted when it took
      // the row; using the stale object would write that count back and the
      // crash would silently buy an extra attempt out of the retry budget.
      const requeued = await this.deps.repo.findById(jobId);
      if (requeued) job = requeued;
    }

    const now = new Date().toISOString();
    // The attempt count is incremented on the take rather than after the
    // failure, so it is already correct for any reader that observes the row
    // while this attempt is in flight.
    const attempts = (job.attempts ?? 0) + 1;
    const maxAttempts = this.deps.retryLimit + 1;
    // queued -> processing (guarded)
    const take = await this.deps.repo.update(
      jobId,
      { status: 'processing', startedAt: now, attempts },
      'queued',
    );
    if (!take.updated) {
      // Lost the race to another worker. Reload and decide.
      const fresh = await this.deps.repo.findById(jobId);
      if (fresh?.status === 'completed' || fresh?.status === 'failed') return;
      throw new AuditError('INTERNAL', `could not claim job ${jobId} for processing`, true);
    }

    try {
      const { report, cache } = await withDeadline(
        this.executeWithCache(job),
        this.deps.jobTimeoutMs,
        `the audit of ${job.input.repoUrl}`,
      );
      await this.deps.repo.update(jobId, {
        status: 'completed',
        report,
        completedAt: new Date().toISOString(),
        error: null,
        errorCode: null,
        cacheJson: JSON.stringify(cache),
      });
      log.info({ jobId, hit: cache.hit, keyVersion: cache.keyVersion }, 'audit job completed');
    } catch (err) {
      const auditErr = this.classify(err);
      // A retryable failure is only retryable while there is an attempt left to
      // spend on it. Past that it is terminal, and the row has to say so:
      // nothing else in the system moves a job out of a non-terminal state, so
      // leaving one there is a job a client polls forever.
      const terminal = !auditErr.retryable || attempts >= maxAttempts;
      log.warn(
        {
          jobId,
          code: auditErr.code,
          message: auditErr.message,
          retryable: auditErr.retryable,
          attempts,
          maxAttempts,
        },
        terminal ? 'audit job failed' : 'audit job failed; another attempt will be made',
      );
      // Guarded on `processing`, which is what we hold: a write that arrives
      // after someone else has settled the row must not clobber it.
      await this.deps.repo.update(
        jobId,
        {
          error: auditErr.message,
          errorCode: auditErr.code,
          attempts,
          failedAt: terminal ? new Date().toISOString() : null,
          // `queued` and not `processing` while an attempt remains. `processing`
          // was both untrue — nothing is processing it — and self-defeating: a
          // redelivered job finds the row in `processing`, and the guard at the
          // top of this method treats that as "someone else has it" and returns
          // without running anything. So the retry arrived, cost nothing, and
          // changed nothing, on both drivers. `queued` is true and the guarded
          // take above can claim it again.
          status: terminal ? 'failed' : 'queued',
        },
        'processing',
      );
      if (!terminal) {
        throw auditErr; // tell the queue to re-deliver
      }
      // Terminal: we do NOT throw. The job is done (failed), and a throw would
      // ask the queue for a retry it must not perform.
    }
  }

  // --------------------------------------------------------------------------

  private async executeWithCache(
    job: AuditJob,
  ): Promise<{ report: Report; cache: { hit: boolean; keyVersion: string; expiresAt: string | null } }> {
    const input = job.input;
    // Build a cache key that includes everything that affects the
    // analysis output. The audit route is responsible for payment
    // verification; by the time we are here, payment is confirmed.
    // We re-use the existing buildCacheKey shape: owner/repo/sha/mode/
    // target/lang/includeLaunchCopy/reportVersion.
    //
    // The report version has to come from the constant, not a literal.
    // It is in the key precisely so a format change does not serve a
    // report written by an older build — which is what a stale literal
    // here would have done the moment the version moved to 1.1.
    const keyVersion = 'v1';
    // Resolve the head SHA. We re-resolve here (instead of trusting
    // the route) so the worker is self-contained: an enqueued job can
    // be re-delivered hours later and the SHA is still current.
    let owner = 'unknown';
    let repo = 'unknown';
    try {
      const parsed = parseRepoUrl(input.repoUrl, this.deps.allowedHosts);
      owner = parsed.owner;
      repo = parsed.repo;
    } catch {
      // Invalid repoUrl: let the pipeline throw.
    }
    const runAudit = async (): Promise<{ report: Report }> => {
      const r = await this.deps.pipeline.run({
        repoUrl: input.repoUrl,
        mode: input.mode,
        target: input.target,
        outputLanguage: input.outputLanguage,
        includeLaunchCopy: input.includeLaunchCopy,
      });
      return { report: r.report };
    };

    // Resolve the head SHA through the repository's *default* branch.
    //
    // This used to try `main`, then `master`, then fall back to the string
    // `'unknown'`. Both names are conventions rather than guarantees, and a
    // repository whose default branch is `develop`, `trunk` or `v1` answers
    // 404 to each — so `commitSha` was the constant `'unknown'`, and the cache
    // key is built from `commitSha`. Every audit of such a repository, at any
    // commit, therefore shared one entry and the first report was served for
    // the whole TTL. GitHub also answers 403 under rate limiting, which failed
    // both guesses and collapsed the key the same way. (R-45.)
    const branch = await this.deps.metadataAnalyzer.getDefaultBranch(owner, repo);
    const commitSha = branch
      ? await this.deps.metadataAnalyzer.getHeadSha(owner, repo, branch).catch(() => null)
      : null;

    // A cache key without a resolved SHA is not a cache key, it is a bucket.
    // Run the audit rather than store it under one.
    if (commitSha === null) {
      const { report } = await runAudit();
      return {
        report: ReportSchema.parse(report),
        cache: { hit: false, keyVersion, expiresAt: null },
      };
    }

    const { buildCacheKey } = await import('./cache-service.js');
    const cacheKey = buildCacheKey({
      owner,
      repo,
      commitSha,
      mode: input.mode,
      target: input.target,
      outputLanguage: input.outputLanguage,
      reportVersion: REPORT_VERSION,
      includeLaunchCopy: input.includeLaunchCopy ?? false,
    });

    const result = await this.deps.cache.getOrCompute(cacheKey, keyVersion, commitSha, runAudit);
    return {
      report: ReportSchema.parse(result.report),
      cache: {
        hit: result.hit,
        keyVersion: result.keyVersion,
        expiresAt: result.expiresAt,
      },
    };
  }

  private classify(err: unknown): AuditError {
    if (err instanceof AuditError) return err;
    const msg = (err as Error)?.message ?? String(err);
    // Heuristic classification. The pipeline currently throws plain
    // errors; the route layer knows the source. In the future, the
    // pipeline can throw a richer error type and we can read it here.
    if (/rate limit|429|403/.test(msg)) {
      return new AuditError('UPSTREAM_RATE_LIMITED', msg, true);
    }
    if (/not found|404/i.test(msg)) {
      return new AuditError('REPO_NOT_FOUND', msg, false);
    }
    if (/invalid input|validation/i.test(msg)) {
      return new AuditError('INVALID_INPUT', msg, false);
    }
    if (/host not allowed/i.test(msg)) {
      return new AuditError('HOST_NOT_ALLOWED', msg, false);
    }
    return new AuditError('UPSTREAM_FAILED', msg, true);
  }
}

/**
 * Await `work`, rejecting with a retryable `JOB_TIMEOUT` if it has not settled
 * within `timeoutMs`.
 *
 * The abandoned promise is not cancelled — it cannot be — but nothing awaits it
 * and it is not a writer of the job row, so a result that arrives late is
 * discarded rather than applied. That is the same bargain pg-boss's
 * `expireInSeconds` makes, and this deadline is deliberately the *inner* of the
 * two: `build-queue.ts` gives pg-boss headroom, because pg-boss's expiry kills
 * the job without letting us write the row's terminal state.
 *
 * Without this, a hang is the one failure that no amount of retry logic
 * reaches: `catch` never runs, so the row never leaves `processing`.
 */
async function withDeadline<T>(work: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AuditError(JOB_TIMEOUT, `${what} did not finish within ${timeoutMs}ms`, true));
        }, timeoutMs);
        // Do not hold the process open for a job we are about to give up on.
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
