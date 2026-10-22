/**
 * The shapes the published OpenAPI document is built from.
 *
 * Why this file exists
 * --------------------
 * `openapi.ts` used to carry `components.schemas` as a hand-copied JSON
 * Schema literal beside the routes. Nothing compared the copy to the Zod
 * schemas the routes actually validate and emit, so it drifted — twice, in
 * ways that matter to a client:
 *
 *   - `CapabilitiesResponse.endpoints` described `{auth, input, output,
 *     rateLimited, pricingUsdt}`. The route has always emitted
 *     `{method, path, description, requiresPayment}`, and it also emits a
 *     `cache` block the document did not mention at all. A client generated
 *     from the document reads four fields that are never sent.
 *   - `CreateAuditRequest.mode` declared `default: 'quick'`. The schema
 *     defaults to `full`, and has since R-37 — the document told a buyer who
 *     omitted the field that they were getting the smaller report, which is
 *     the opposite of what the code does with the field they paid for.
 *
 * The fix is not another careful copy. Every entry in `SPEC_SCHEMAS` is a Zod
 * schema, and `buildOpenApiSpec()` converts it. A shape that changes in the
 * source changes in the document on the next build, or `pnpm openapi:check`
 * fails; there is no third copy to keep in step.
 *
 * What is *not* here
 * ------------------
 * The `paths` block. Which status codes an operation can return, what a 409
 * means, whether a route is paid — none of that is derivable from a schema,
 * and it stays hand-written in `openapi.ts` where a reviewer reads it. This
 * file supplies the nouns; that file supplies the sentences.
 */
import { z } from 'zod';
import {
  CapabilitiesSchema,
  CreateAuditInputSchema,
  FreeCheckInputSchema,
  FreeCheckReportSchema,
  JobStatusSchema,
} from '@repopilot/core';
import { ResponseSchema as HealthResponseSchema } from './routes/health.js';

/**
 * Re-exported so a consumer has one place to import a published shape from.
 * The schema itself stays in `routes/health.ts`, beside the handler that
 * produces it — that is where it was and where the route's own `parse()` call
 * reads it, and moving it would leave the route importing its own contract.
 */
export { HealthResponseSchema };

/**
 * The error envelope every `sendError()` call produces.
 *
 * `details` is present only when the thrower supplied it — `sendError` writes
 * the key unconditionally but `JSON.stringify` drops an `undefined` value, so
 * a client never sees it as `null`.
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/**
 * 202 from `POST /api/v1/audits`.
 *
 * The POST path only ever queues, so `status` is the literal `'queued'` here
 * and not the wider `JobStatus` — a client polling the `statusUrl` is the one
 * that can see `processing`.
 */
export const AuditQueuedResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('queued'),
  statusUrl: z.string(),
  pollAfterMs: z.number().int().nonnegative(),
});

/**
 * 202 from `GET /api/v1/audits/{jobId}` — the job exists but has no answer yet.
 *
 * Separate from `AuditQueuedResponseSchema` because this one carries
 * `createdAt` and the POST one does not. The document used to describe both
 * with a single schema, which meant it was wrong about one of them whichever
 * way it was written.
 */
export const AuditPendingResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'processing']),
  statusUrl: z.string(),
  pollAfterMs: z.number().int().nonnegative(),
  createdAt: z.string(),
});

/** 200 from `GET /api/v1/audits/{jobId}` for a job that ended in failure. */
export const AuditFailedResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('failed'),
  error: z.object({ code: z.string(), message: z.string() }),
  createdAt: z.string(),
  failedAt: z.string().nullable(),
});

/** 200 from `GET /api/v1/audits/{jobId}` for a completed job. */
export const AuditCompletedResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('completed'),
  /**
   * The report document, deliberately untyped here.
   *
   * Its shape is `ReportSchema`, versioned separately (`reportVersion`), and a
   * stored job may carry an older version than the code emits. Inlining the
   * current schema into the contract would say "every report looks like 1.5",
   * which is the one thing `SUPPORTED_REPORT_VERSIONS` exists to deny.
   */
  report: z.unknown().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  cache: z.object({
    hit: z.boolean(),
    keyVersion: z.string(),
    expiresAt: z.string().nullable(),
  }),
});

/**
 * 200 from `GET /api/v1/audits/{jobId}` — one of two bodies, told apart by
 * `status`. A union rather than one object with everything optional: the
 * document should say that a failed job has no `report` and a completed one
 * has no `error`, not that either might be missing.
 */
export const AuditStatusResponseSchema = z.union([
  AuditFailedResponseSchema,
  AuditCompletedResponseSchema,
]);

/** The quote attached to a 402. `challenge` is the adapter's own envelope. */
export const PaymentQuoteSchema = z.object({
  paymentId: z.string(),
  mode: z.enum(['mock', 'okx']),
  amount: z.string(),
  currency: z.string(),
  challenge: z.unknown(),
  expiresAt: z.string(),
});

/** 402 for a caller that has not supplied `X-PAYMENT`. */
export const PaymentRequiredResponseSchema = z.object({
  jobId: z.string(),
  /**
   * The row's status, reported truthfully. A job can be `completed` here: the
   * audit ran, the caller has not shown payment for it, and the challenge is
   * attached to that row so paying it delivers the report rather than looping.
   */
  status: JobStatusSchema,
  payment: PaymentQuoteSchema,
  nextAction: z.string(),
});

/** 402 for a caller whose `X-PAYMENT` names a payment that has not settled. */
export const PaymentNotSettledResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    payment: z.unknown(),
  }),
  paymentId: z.string(),
});

export const PaymentChallengeResponseSchema = z.union([
  PaymentRequiredResponseSchema,
  PaymentNotSettledResponseSchema,
]);

/**
 * 503 from `POST /api/v1/audits` when the queue refused the job.
 *
 * Not `ErrorResponseSchema`: this body carries `jobId` beside `error`, so the
 * client can keep the id and retry with it. Describing it as the plain error
 * envelope made the extra field look like a mistake.
 */
export const EnqueueFailedResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  jobId: z.string(),
});

/**
 * Body of `POST /api/v1/repositories/{owner}/{repo}/reaudit`.
 *
 * The repository comes from the path, so this is `CreateAuditInputSchema`
 * with `repoUrl` removed — `.omit()`, not a second literal. The route does the
 * same thing in reverse: it fills `repoUrl` in from the path segments and
 * validates the result with the full schema. A hand-written copy here would
 * have been the third place the defaults live.
 */
export const ReauditRequestSchema = CreateAuditInputSchema.omit({ repoUrl: true });

/**
 * `GET /` — the discovery payload.
 *
 * Documented because the coverage gate has no exemption list: a route the
 * process serves is a route in the contract. It is also the one place a human
 * can see the whole surface without a client.
 */
export const RootResponseSchema = z.object({
  name: z.literal('RepoPilot'),
  version: z.string(),
  endpoints: z.array(z.string()),
});

/**
 * `GET /docs/openapi.json` — the document, describing itself.
 *
 * Deliberately shallow. Typing the whole OpenAPI meta-schema here would be a
 * second definition of a standard, and the three fields below are the ones a
 * client checks before parsing the rest.
 */
export const OpenApiDocumentSchema = z
  .object({
    openapi: z.string(),
    info: z.object({ title: z.string(), version: z.string() }),
    paths: z.record(z.string(), z.unknown()),
  })
  .passthrough();

/**
 * Every component the document may reference, by the name it is referenced
 * under. `openapi.test.ts` fails on an entry nothing references, so this is a
 * contract and not a catalogue.
 */
export const SPEC_SCHEMAS = {
  RootResponse: RootResponseSchema,
  HealthResponse: HealthResponseSchema,
  OpenApiDocument: OpenApiDocumentSchema,
  CapabilitiesResponse: CapabilitiesSchema,
  FreeCheckRequest: FreeCheckInputSchema,
  FreeCheckReport: FreeCheckReportSchema,
  CreateAuditRequest: CreateAuditInputSchema,
  ReauditRequest: ReauditRequestSchema,
  AuditQueuedResponse: AuditQueuedResponseSchema,
  AuditPendingResponse: AuditPendingResponseSchema,
  AuditStatusResponse: AuditStatusResponseSchema,
  PaymentChallenge: PaymentChallengeResponseSchema,
  EnqueueFailedResponse: EnqueueFailedResponseSchema,
  ErrorResponse: ErrorResponseSchema,
} as const;

export type SpecSchemaName = keyof typeof SPEC_SCHEMAS;
