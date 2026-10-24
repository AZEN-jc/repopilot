/**
 * InlineAuditQueue — in-process audit job scheduler.
 *
 * Used for:
 *   - SQLite local dev (`pnpm dev`)
 *   - unit / integration tests
 *   - environments without PostgreSQL
 *   - `verify:release` (smoke test)
 *
 * Semantics:
 *   - `enqueue()` schedules the job on a small, bounded worker pool and
 *     returns immediately. The HTTP request never waits for the analysis.
 *   - Concurrency is configurable via `AUDIT_QUEUE_CONCURRENCY`
 *     (default 1). Concurrency > 1 is safe because the worker is
 *     idempotent at the jobId level (the conditional `expectedStatus`
 *     update prevents two workers from running the same job).
 *   - Duplicate enqueues (same jobId) coalesce: a second `enqueue()` for
 *     an already-scheduled job returns `accepted: false` and does NOT
 *     schedule a second run.
 *   - `stop()` is a graceful drain: it refuses new enqueues, keeps running the
 *     jobs it already accepted (pending ones included), and waits up to
 *     `SHUTDOWN_GRACE_PERIOD_MS` for them.
 *   - A job that fails is re-attempted up to `retryLimit` times. The worker
 *     signals "another attempt is warranted" by throwing, and stops throwing
 *     once its own budget is spent — so this loop is the whole of the driver's
 *     retry policy, and it never has to know how many attempts are left.
 *   - The queue can never be silently selected in production: the
 *     config validator refuses `NODE_ENV=production + AUDIT_QUEUE_DRIVER=inline`.
 */
import { runInTraceContext } from '@repopilot/core';
import type {
  AuditQueue,
  AuditQueueJob,
  EnqueueResult,
  QueueHealth,
  AuditQueueDriver,
} from './audit-queue.js';

export interface InlineAuditQueueDeps {
  /** Invokes the actual audit logic for one jobId. One call is one attempt. */
  runOne: (jobId: string) => Promise<void>;
  /**
   * How many times a failed job may be re-attempted, after the first attempt.
   * Mirrors `AUDIT_QUEUE_RETRY_LIMIT`, which is also what pg-boss's own
   * `retryLimit` is set to, so both drivers make the same number of attempts
   * for the same configuration.
   *
   * Default 0. A driver handed no budget must not invent one.
   */
  retryLimit?: number;
  /** How long `stop()` waits for in-flight jobs to drain. */
  shutdownGraceMs: number;
  /** Max parallel jobs. Default 1. */
  concurrency: number;
  /** Optional logger (e.g. pino). Defaults to a no-op. */
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

interface NoopLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const NOOP_LOG: NoopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export class InlineAuditQueue implements AuditQueue {
  readonly driver: AuditQueueDriver = 'inline';

  private readonly runOne: InlineAuditQueueDeps['runOne'];
  private readonly retryLimit: number;
  private readonly shutdownGraceMs: number;
  private readonly concurrency: number;
  private readonly log: NoopLogger;

  private readonly inFlight = new Set<string>();
  private readonly inflightPromises = new Set<Promise<void>>();
  private accepting = true;
  private started = false;
  /** Pending jobs waiting for a free worker slot. */
  private readonly pending: AuditQueueJob[] = [];
  private activeWorkers = 0;

  constructor(deps: InlineAuditQueueDeps) {
    this.runOne = deps.runOne;
    this.retryLimit = Math.max(0, deps.retryLimit ?? 0);
    this.shutdownGraceMs = deps.shutdownGraceMs;
    this.concurrency = Math.max(1, deps.concurrency);
    this.log = deps.log ?? NOOP_LOG;
  }

  async start(): Promise<void> {
    this.started = true;
    this.accepting = true;
    this.log.info({ driver: this.driver, concurrency: this.concurrency }, 'audit queue started');
  }

  async enqueue(input: AuditQueueJob): Promise<EnqueueResult> {
    if (!this.started) {
      throw new Error('InlineAuditQueue.enqueue called before start()');
    }
    if (!this.accepting) {
      throw new Error('InlineAuditQueue is shutting down; not accepting new jobs');
    }
    if (this.inFlight.has(input.jobId) || this.pending.some((j) => j.jobId === input.jobId)) {
      return { jobId: input.jobId, acceptedAt: new Date().toISOString(), accepted: false };
    }
    this.inFlight.add(input.jobId);
    // The whole payload, not just the id: the trace context the enqueuing
    // request captured has to survive the wait for a worker slot.
    this.pending.push(input);
    void this.dispatch();
    return { jobId: input.jobId, acceptedAt: new Date().toISOString(), accepted: true };
  }

  /**
   * Graceful shutdown. We:
   *   1. Stop accepting new enqueues (`accepting = false`). This flag means
   *      exactly that and nothing else — it is not a drain switch.
   *   2. Let the jobs already accepted run to completion: `dispatch()` keeps
   *      pulling from `pending` until it is empty, whether or not shutdown has
   *      begun. "Refuse new work" and "finish accepted work" are two different
   *      decisions, and tying them to one flag meant that the moment shutdown
   *      started, every job already sitting in `pending` was never started —
   *      the client had a 202 and a `statusUrl`, and the row stayed `queued`.
   *   3. Wait for all of them, up to `shutdownGraceMs`. `inFlight` holds every
   *      accepted-but-unfinished job, pending included, so this waits for the
   *      queue to empty rather than only for the workers that happened to be
   *      busy when `stop()` was called.
   *   4. Force-resolve: anything still running gets no further wait. Whatever
   *      is left is named in the log line, because nothing else will mention
   *      it.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.accepting = false;
    // Nudge the drain in case every worker is idle with work still queued.
    // It cannot normally happen (enqueue dispatches, and each worker's finally
    // dispatches again), but this is the one call that makes the guarantee
    // unconditional rather than a property of the other two.
    this.dispatch();
    const deadline = Date.now() + this.shutdownGraceMs;
    while (this.inFlight.size > 0 && Date.now() < deadline) {
      // Build a settled Promise that we can await. We swallow errors
      // here because `stop()` is best-effort: we will continue
      // waiting until either the in-flight tasks finish or the
      // grace deadline elapses.
      const inflightSettled: Promise<unknown> = Promise
        .all(Array.from(this.inflightPromises))
        // eslint-disable-next-line no-floating-promise
        .catch(() => undefined);
      const tick: Promise<void> = new Promise((r) =>
        setTimeout(() => r(undefined), 200),
      );
      await Promise.race([inflightSettled, tick]);
    }
    if (this.inFlight.size > 0) {
      this.log.warn(
        {
          abandoned: this.inFlight.size,
          pending: this.pending.length,
          running: this.activeWorkers,
        },
        'InlineAuditQueue shutdown grace period elapsed with jobs still unfinished; forcing close',
      );
    }
    this.started = false;
    this.log.info({ driver: this.driver }, 'audit queue stopped');
  }

  async health(): Promise<QueueHealth> {
    // Not started means "cannot take work", exactly as the pg-boss driver
    // reports it. `accepting` is initialised `true` and only `stop()` clears
    // it, so before `start()` — and in any process that never starts a queue —
    // this answered `ok` / `acceptingJobs: true` about a queue with no workers
    // (R-76).
    if (!this.started) {
      return { driver: this.driver, status: 'unavailable', acceptingJobs: false };
    }
    return {
      driver: this.driver,
      status: this.accepting ? 'ok' : 'unavailable',
      acceptingJobs: this.accepting,
      // `inFlight` is every accepted-and-unfinished job: the ones in `pending`
      // and the ones a worker is holding. That is the same quantity pg-boss
      // reports (`queuedCount + activeCount`), so the two drivers agree on
      // `pending`; `active` is what makes the number decomposable.
      pending: this.inFlight.size,
      active: this.activeWorkers,
    };
  }

  // --------------------------------------------------------------------------

  private dispatch(): void {
    while (this.activeWorkers < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (job === undefined) break;
      this.activeWorkers += 1;
      const p = this.runJob(job)
        // eslint-disable-next-line no-floating-promise
        .catch((err: unknown) => {
          // `runJob` consumes the failures it knows how to consume, so reaching
          // here means something threw past it — the logger itself, or a bug in
          // the loop. Kept as a net so that becomes a log line rather than an
          // unhandled rejection.
          this.log.warn(
            { jobId: job.jobId, err: (err as Error)?.message ?? 'unknown' },
            'audit job threw past InlineAuditQueue',
          );
        })
        // eslint-disable-next-line no-floating-promise
        .finally(() => {
          this.activeWorkers -= 1;
          // Continue draining the pending queue. Deliberately not gated on
          // `accepting`: that flag refuses *new* work, and the jobs in
          // `pending` were accepted before shutdown began. Gating the drain on
          // it meant `stop()` waited out its whole grace period while every
          // accepted job sat unstarted (R-70).
          if (this.pending.length > 0) {
            void this.dispatch();
          }
        });
      this.inflightPromises.add(p);
      const tracked = p.finally(() => this.inflightPromises.delete(p));
      // Intentional fire-and-forget: the chain ends in `p` (the work
      // itself) which is observed by `inflightPromises` so `stop()`
      // can wait for it. We do not await here.
      void tracked;
    }
  }

  /**
   * One job, attempted up to `retryLimit + 1` times.
   *
   * The worker throws to ask for another attempt and stops throwing once its
   * budget is spent — on the last one it writes the terminal state itself — so
   * this loop spends a budget rather than deciding anything. That split is
   * deliberate: only the row knows how many attempts it has had, and the inline
   * driver has no other way to find out.
   */
  private async runJob(job: AuditQueueJob): Promise<void> {
    const jobId = job.jobId;
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this.retryLimit; attempt++) {
        try {
          // Each attempt runs as a child of the enqueuing request's trace, so
          // a retry appears under the trace that asked for the audit rather
          // than as an orphan.
          await runInTraceContext(job, () => this.runOne(jobId));
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      // Every attempt was thrown away without the worker getting as far as the
      // row — a DB error on the way in, most likely, since anything after the
      // take is recorded and terminal-led by the worker itself. Deliberately
      // *not* marked `failed` here: `failed` is terminal, and a job that was
      // never audited should not be permanently failed by a hiccup that may
      // well be transient. It stays `queued`, which is true, and is logged
      // because nothing else will mention it.
      this.log.warn(
        {
          jobId,
          attempts: this.retryLimit + 1,
          err: (lastErr as Error)?.message ?? 'unknown',
        },
        'audit job never reached the worker; leaving it queued',
      );
    } finally {
      this.inFlight.delete(jobId);
    }
  }
}
