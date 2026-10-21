/**
 * `POST /api/v1/audits` when the queue refuses the job (R-75).
 *
 * The route answered 503 and wrote `failed` + the queue's own error text onto
 * the row. Both halves were wrong, and they were wrong together:
 *
 *   - `failed` is terminal and the worker claims on `expectedStatus: 'queued'`,
 *     so the retry the 503 asks for could never run the job. The response told
 *     the client to do something the write had just made impossible.
 *   - The text came from whatever the driver threw — pg-boss's connection
 *     error names host and port — and `GET /audits/:jobId` serves that column
 *     as `error.message`. That is R-65's disclosure through a second door.
 *
 * So the case asserts the two things the fix is: the row is still `queued`
 * (retryable), and the thrown message appears in neither response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AuditPipeline, MetadataAnalyzer } from '@repopilot/core';
import { buildApp, type AppDeps } from '../server.js';
import type { AuditQueue, EnqueueResult, QueueHealth } from '../queue/audit-queue.js';

/**
 * The string a driver's error carries and a caller must never see.
 *
 * Deliberately shaped like the real thing — a pg connection failure names a
 * host and a port — because the point is that this sentence is a map of the
 * deployment, not that it contains a particular word.
 */
const LEAKY = 'connect ECONNREFUSED 10.0.0.5:5432';

class RefusingQueue implements AuditQueue {
  readonly driver = 'inline' as const;
  private started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async enqueue(): Promise<EnqueueResult> {
    throw new Error(LEAKY);
  }

  async health(): Promise<QueueHealth> {
    return { driver: this.driver, status: 'ok', acceptingJobs: this.started, pending: 0, active: 0 };
  }
}

class FakeMetadata {
  async getDefaultBranch(): Promise<string | null> {
    return 'main';
  }
  async getHeadSha(): Promise<string | null> {
    return 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  }
  async fetch(): Promise<never> {
    throw new Error('the fake metadata analyzer is never asked for a tree here');
  }
}

const BODY = { repoUrl: 'https://github.com/okx/repopilot' };

describe('POST /api/v1/audits — the queue refuses the job', () => {
  let app: FastifyInstance;
  let queue: RefusingQueue;

  beforeAll(async () => {
    queue = new RefusingQueue();
    const deps: AppDeps = {
      payment: {
        mode: 'mock',
        okx: { recipientAddress: '', network: 'xlayer', x402Version: 2 },
        pricing: { audit: { amount: '0.02', currency: 'USDT' } },
      },
      allowedHosts: ['github.com'],
      pipeline: {} as unknown as AuditPipeline,
      metadataAnalyzer: new FakeMetadata() as unknown as MetadataAnalyzer,
      databaseUrl: 'file:./data/test-enqueue-failure.db',
      queue,
    };
    app = await buildApp(deps);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('leaves the job queued and keeps the driver error out of both responses', async () => {
    // Pay first: the enqueue path is step 5, so a job only reaches it with a
    // verified payment. The 402 hands back the paymentId that makes the
    // replay a settlement rather than a second quote.
    const quote = await app.inject({ method: 'POST', url: '/api/v1/audits', payload: BODY });
    expect(quote.statusCode).toBe(402);
    const { jobId, payment } = quote.json() as { jobId: string; payment: { paymentId: string } };

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: BODY,
      headers: { 'x-payment': `mock:${payment.paymentId}` },
    });

    expect(replay.statusCode).toBe(503);
    expect((replay.json() as { error: { code: string } }).error.code).toBe('ENQUEUE_FAILED');
    expect(replay.body).not.toContain('ECONNREFUSED');
    expect(replay.body).not.toContain('10.0.0.5');

    // The row, which is what the retry will act on. `queued` is the state the
    // worker can claim; `failed` would have been terminal and the retry a
    // no-op that still answered 202.
    const poll = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
    const row = poll.json() as { status: string; error?: { message?: string } | null };
    expect(row.status).toBe('queued');
    expect(poll.statusCode).toBe(202);
    expect(JSON.stringify(row)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(row)).not.toContain('10.0.0.5');
  });
});
