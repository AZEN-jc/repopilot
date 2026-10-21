/**
 * InlineAuditQueue — shutdown.
 *
 * One invariant, and it is the whole file: **a job the queue accepted is
 * either finished or named in the log, never silently abandoned.** `enqueue()`
 * resolving is the promise the HTTP route turns into `202 Accepted` plus a
 * `statusUrl`; everything downstream of it is the queue's problem.
 *
 * The defect these cases pin (R-70) was a single boolean doing two jobs.
 * `stop()` set `accepting = false` to refuse new work, and `dispatch()`'s
 * `.finally` read the same flag to decide whether to keep draining `pending` —
 * so shutdown and "stop working" were the same event. A second job enqueued
 * behind a busy worker was accepted, never started, and never waited for:
 * `stop()` polled `inFlight`, which did include it, but the only promises it
 * awaited were the workers', so it burned the grace period and closed.
 *
 * That is why the first case is written the way it is — one busy worker, two
 * jobs, `stop()` called while the second is still queued. Concurrency 1 is not
 * incidental: it is what makes `pending` non-empty at the moment shutdown
 * begins, which is the only state the defect was visible in.
 */
import { describe, expect, it } from 'vitest';

import { InlineAuditQueue } from './inline-audit-queue.js';

function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('InlineAuditQueue — shutdown', () => {
  it('runs the jobs it already accepted before stop() resolves', async () => {
    const first = gate();
    const ran: string[] = [];
    const queue = new InlineAuditQueue({
      runOne: async (jobId) => {
        ran.push(jobId);
        if (jobId === 'first') await first.promise;
      },
      concurrency: 1,
      shutdownGraceMs: 5_000,
    });

    await queue.start();
    await queue.enqueue({ jobId: 'first' });
    await queue.enqueue({ jobId: 'second' });

    // The single worker is holding `first`, so `second` is accepted and queued.
    // Without this the case would not reach the drain path at all.
    expect(ran).toEqual(['first']);

    const stopping = queue.stop();
    first.release();
    await stopping;

    expect(ran).toEqual(['first', 'second']);
  });

  it('refuses new work as soon as stop() begins, while accepted work drains', async () => {
    const first = gate();
    const ran: string[] = [];
    const queue = new InlineAuditQueue({
      runOne: async (jobId) => {
        ran.push(jobId);
        if (jobId === 'first') await first.promise;
      },
      concurrency: 1,
      shutdownGraceMs: 5_000,
    });

    await queue.start();
    await queue.enqueue({ jobId: 'first' });

    const stopping = queue.stop();
    // The two halves of the contract, observed at the same instant: the door
    // is shut to new work, and the work already inside is still running.
    await expect(queue.enqueue({ jobId: 'late' })).rejects.toThrow(/shutting down/);
    await expect(queue.health()).resolves.toMatchObject({ acceptingJobs: false });

    first.release();
    await stopping;
    expect(ran).toEqual(['first']);
  });
});
