/**
 * SQLite repository integration test.
 *
 * Verifies the SQLite path: schema creation, CRUD, payment_id unique
 * index. Runs by default in `pnpm --filter @repopilot/api test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openIsolatedSqlite, runMigrations } from '../db/client.js';
import { JobRepository } from '../repositories/job-repository.js';
import { JobService } from '../services/job-service.js';
import { MockPaymentAdapter } from '@repopilot/okx-adapter';
import type { AuditJob, Report } from '@repopilot/core';
import { AuditJobSchema } from '@repopilot/core';

describe('SQLite repository (in-memory)', () => {
  let repo: JobRepository;

  beforeAll(async () => {
    const db = openIsolatedSqlite('file:./data/test-sqlite-repo.db');
    expect(db.mode).toBe('sqlite');
    await runMigrations(db);
    repo = new JobRepository(db);
  });

  afterAll(async () => {
    // close handled implicitly
  });

  it('inserts and reads back a job', async () => {
    const job: AuditJob = AuditJobSchema.parse({
      jobId: `job_test_a_${Date.now()}`,
      status: 'queued',
      input: {
        repoUrl: 'https://github.com/octocat/Hello-World',
        mode: 'quick',
        target: 'open_source',
        outputLanguage: 'en',
        includeLaunchCopy: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentId: `pay_test_a_${Date.now()}`,
      report: null,
      error: null,
    });
    await repo.insert(job);
    const got = await repo.findById(job.jobId);
    expect(got?.jobId).toBe(job.jobId);
    expect(got?.input.mode).toBe('quick');
  });

  it('enforces payment_id uniqueness', async () => {
    const paymentId = `pay_dup_${Date.now()}`;
    const a: AuditJob = AuditJobSchema.parse({
      jobId: `job_dup_a_${Date.now()}`,
      status: 'queued',
      input: {
        repoUrl: 'https://github.com/octocat/Hello-World',
        mode: 'quick',
        target: 'open_source',
        outputLanguage: 'en',
        includeLaunchCopy: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentId,
      report: null,
      error: null,
    });
    await repo.insert(a);

    const b: AuditJob = AuditJobSchema.parse({
      ...a,
      jobId: `job_dup_b_${Date.now()}`,
    });
    await expect(repo.insert(b)).rejects.toThrow();
  });

  it('updates a job to completed and stores the report as JSON', async () => {
    const jobId = `job_test_c_${Date.now()}`;
    const job: AuditJob = AuditJobSchema.parse({
      jobId,
      status: 'queued',
      input: {
        repoUrl: 'https://github.com/octocat/Hello-World',
        mode: 'quick',
        target: 'open_source',
        outputLanguage: 'en',
        includeLaunchCopy: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentId: null,
      report: null,
      error: null,
    });
    await repo.insert(job);
    const report = { reportVersion: '1.0', scores: { overall: 42 } } as unknown as Report;
    await repo.update(jobId, { status: 'completed', report });
    const got = await repo.findById(jobId);
    expect(got?.status).toBe('completed');
    expect((got?.report as { scores: { overall: number } } | null)?.scores.overall).toBe(42);
  });

  /**
   * `list` is `/health`'s probe, and it used to read the whole table and slice
   * the tail in memory — every report on every poll. The fix moves the limit
   * into the query, which also fixes the order: the tail of an unordered read
   * is insertion order, so the probe was answering "oldest first" while
   * Postgres's `LIMIT` without `ORDER BY` answered "whichever rows".
   *
   * Its own in-memory database, because the question is "which rows does a
   * limit keep, and in what order" and the file-backed database above survives
   * between runs. The first version used fixed `2099` timestamps to outrank
   * whatever was already there; two runs then wrote *identical* timestamps,
   * tied, and left the order to the index — a test that passed or failed on
   * its own leftovers.
   */
  it('lists the newest jobs first, and only as many as asked for', async () => {
    const own = openIsolatedSqlite(':memory:');
    await runMigrations(own);
    const ownRepo = new JobRepository(own);

    const make = (n: number, createdAt: string): AuditJob =>
      AuditJobSchema.parse({
        jobId: `job_list_${n}`,
        status: 'queued',
        input: {
          repoUrl: 'https://github.com/octocat/Hello-World',
          mode: 'quick',
          target: 'open_source',
          outputLanguage: 'en',
          includeLaunchCopy: false,
        },
        createdAt,
        updatedAt: createdAt,
        paymentId: null,
        report: null,
        error: null,
      });

    const oldest = make(1, '2026-01-01T00:00:01.000Z');
    const middle = make(2, '2026-01-01T00:00:02.000Z');
    const newest = make(3, '2026-01-01T00:00:03.000Z');
    await ownRepo.insert(oldest);
    await ownRepo.insert(middle);
    await ownRepo.insert(newest);

    const two = await ownRepo.list(2);
    expect(two.map((j) => j.jobId)).toEqual([newest.jobId, middle.jobId]);
    expect(two).toHaveLength(2);

    // `DB` is a union: only the SQLite handle carries `raw`.
    if (own.mode === 'sqlite') own.raw.close();
  });
});

/**
 * The idempotency-key race, on the backend that can express it.
 *
 * The defect (R-66) was structural rather than probabilistic: `create()` wrote
 * the row and the key in two statements, so the unique index only ever saw the
 * *second* statement. A pre-check that found nothing, followed by an insert,
 * left the key unclaimed for the width of one round trip.
 *
 * Two connections to one file is the smallest faithful model of that. Both read
 * "no job for this key" before either writes — which is exactly the state two
 * concurrent requests are in — and the second insert is then refused by
 * `uq_jobs_idempotency_key`. What is asserted is the answer the caller gets:
 * the winning job, not a 500.
 *
 * A file rather than `:memory:` because two in-memory handles are two separate
 * databases; the whole point is a shared index.
 */
describe('SQLite idempotency key (two connections, one file)', () => {
  it('answers with the winning job when a second insert hits the unique index', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repopilot-idem-'));
    const dbA = openIsolatedSqlite(join(dir, 'jobs.db'));
    const dbB = openIsolatedSqlite(join(dir, 'jobs.db'));
    try {
      await runMigrations(dbA);
      const repoA = new JobRepository(dbA);
      const repoB = new JobRepository(dbB);
      const serviceA = new JobService(repoA, new MockPaymentAdapter());
      const serviceB = new JobService(repoB, new MockPaymentAdapter());
      const key = `idem_${Date.now()}`;
      const input = {
        repoUrl: 'https://github.com/octocat/Hello-World',
        mode: 'quick' as const,
        target: 'open_source' as const,
        outputLanguage: 'en' as const,
        includeLaunchCopy: false,
      };

      // The route's pre-check, run on both connections before either writes.
      expect(await repoA.findByIdempotencyKey(key)).toBeNull();
      expect(await repoB.findByIdempotencyKey(key)).toBeNull();

      const first = await serviceA.create(input, key);
      const second = await serviceB.create(input, key);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.job.jobId).toBe(first.job.jobId);

      // One key, one row — and the row the caller was handed is the row in the
      // table, not a locally built object with a jobId that does not exist.
      const stored = await repoA.findByIdempotencyKey(key);
      expect(stored?.jobId).toBe(first.job.jobId);

      // One job, not two. This is the second window the two-statement create
      // opened: the row was inserted before the key was written, so a retry
      // that lost the key race had already created a second queued job by the
      // time the index complained.
      expect(await repoA.list(10)).toHaveLength(1);
    } finally {
      if (dbA.mode === 'sqlite') dbA.raw.close();
      if (dbB.mode === 'sqlite') dbB.raw.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
