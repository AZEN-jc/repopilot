/**
 * Audit queue interface and shared types.
 *
 * The audit pipeline is async; this interface lets us swap the
 * transport (in-process for dev/test, pg-boss for production) without
 * touching the route layer or the worker itself.
 *
 * Lifecycle:
 *   1. The HTTP route creates a `queued` job in the DB and calls
 *      `enqueue({ jobId })`. The route returns 202 immediately.
 *   2. The driver (Inline or PgBoss) eventually invokes the registered
 *      `AuditWorker.runOnce({ jobId })` for each job.
 *   3. The worker transitions the job: queued -> processing -> completed
 *      or failed, using the conditional update on `expectedStatus` to
 *      keep the state machine honest.
 *   4. On shutdown, `stop()` stops accepting new jobs, waits for the
 *      in-flight tasks to drain (up to the configured grace period),
 *      and releases its resources.
 *
 * NOTE: `enqueue` MUST be safe to call from inside a DB transaction
 * boundary. Implementations should NOT perform side-effects on the
 * HTTP response (no awaits of arbitrary network calls) — the route
 * returns 202 as soon as `enqueue` resolves.
 */
import type { TraceCarrier } from '@repopilot/core';

export type AuditQueueDriver = 'inline' | 'pg-boss';

/**
 * What the queue carries. `jobId` is the work; the trace fields are the
 * context of the request that asked for it.
 *
 * The trace context rides in the payload rather than in the job row because
 * it is a property of *this delivery*, not of the job: a job re-delivered
 * hours later belongs to the trace of the retry, not the trace of the
 * original POST. pg-boss persists the payload with the job, so the fields
 * survive a restart without a schema change.
 */
export interface AuditQueueJob extends TraceCarrier {
  jobId: string;
}

export interface EnqueueResult {
  jobId: string;
  /** When the driver accepted the job (ISO timestamp). */
  acceptedAt: string;
  /** True if the driver is currently scheduling this job. False if a
   *  duplicate enqueue was rejected (idempotency at the queue level). */
  accepted: boolean;
}

export type QueueHealthStatus = 'ok' | 'degraded' | 'unavailable';

export interface QueueHealth {
  driver: AuditQueueDriver;
  status: QueueHealthStatus;
  /** True if the queue will accept new jobs right now. False while
   *  shutting down. */
  acceptingJobs: boolean;
  /**
   * Jobs the driver has accepted and not finished — **queued and running
   * together**, not just the waiting ones.
   *
   * The name said "pending" and both drivers meant "outstanding", which is
   * how a backlog of 5 could be one job running and four waiting (R-76).
   * Kept as the total because that is the number an operator needs first;
   * `active` splits it.
   */
  pending?: number;
  /** Of `pending`, the ones running right now. `pending - active` is the
   *  queue depth — the number that grows when the workers cannot keep up. */
  active?: number;
}

export interface AuditQueue {
  /** Which driver this queue is using. Surfaced for logs and health. */
  readonly driver: AuditQueueDriver;
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue(input: AuditQueueJob): Promise<EnqueueResult>;
  health(): Promise<QueueHealth>;
}
