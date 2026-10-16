/**
 * AuditWorker's failure contract, exercised on the driver that has no retry of
 * its own.
 *
 * === WHAT THIS FILE IS FOR =============================================
 * R-43. `runOnce` classifies a failure and, when the classification is
 * *retryable*, deliberately leaves the row for the queue to re-deliver. Both
 * drivers failed to honour that, in different ways, and neither failure was
 * visible from the worker alone:
 *
 *   - `InlineAuditQueue.dispatch()` caught the throw and logged it. No retry,
 *     no terminal transition, so the row stayed `processing` and nothing in the
 *     process would ever move it.
 *   - pg-boss *did* redeliver, but the row was still `processing` when the
 *     redelivery arrived, and `runOnce` skips a job it finds in `processing` —
 *     so the retry was silently dropped. `retryLimit` was set, read, and
 *     meaningless on both drivers.
 *
 * Both end the same way: a job a client polls forever. `verify:release` step
 * 11b is the witness — it polls a job for a deliberately non-existent
 * repository to a terminal state and carries the comment "The queue retries
 * once, then the job ends in `failed` state", which was true of neither driver
 * until this batch.
 *
 * So the invariant these tests pin is one sentence long: **a job that fails
 * reaches a terminal state, and it takes the number of attempts that was
 * configured.** Every case below is a way that can go wrong.
 *
 * === WHY A STUB PIPELINE ==============================================
 * The failure has to be *classified* to exercise the retryable path, and the
 * only thing that decides the classification is the thrown error. A real
 * pipeline would need the network to produce one, and the interesting cases —
 * "retryable, then terminal", "retryable until the budget runs out" — are
 * sequences, not requests. The stub also makes the assertion exact: `run` is
 * counted, so "was it actually re-attempted" is observed rather than inferred
 * from a status that several paths can produce.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuditError } from './audit-worker.js';
import { buildAuditQueue } from '../queue/build-queue.js';
import { openIsolatedSqlite, runMigrations } from '../db/client.js';
import { JobRepository } from '../repositories/job-repository.js';
import { ReportCacheRepository } from '../repositories/report-cache-repository.js';
import { CacheService } from './cache-service.js';
import {
  AuditJobSchema,
  type AuditJob,
  type AuditPipeline,
  type MetadataAnalyzer,
  type Report,
} from '@repopilot/core';
import { ReportBuilder } from '@repopilot/core/report';
import { createLogger } from '../utils/logger.js';
import { _resetConfigCacheForTests } from '../config.js';

let tmpDir: string;
let prevEnv: Record<string, string | undefined>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'repopilot-worker-contract-'));
  prevEnv = { ...process.env };
  process.env['NODE_ENV'] = 'test';
  process.env['PAYMENT_MODE'] = 'mock';
  process.env['AUDIT_QUEUE_DRIVER'] = 'inline';
  process.env['DATABASE_URL'] = `file:${join(tmpDir, 'test.db')}`;
  process.env['LOG_LEVEL'] = 'silent';
  _resetConfigCacheForTests();
});

afterEach(() => {
  process.env = prevEnv;
  _resetConfigCacheForTests();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** A pipeline that throws the errors it was given, one per call, in order. */
function scriptedPipeline(errors: Error[]): { pipeline: AuditPipeline; calls: () => number } {
  let calls = 0;
  const pipeline = {
    run: async (): Promise<never> => {
      const err = errors[Math.min(calls, errors.length - 1)] ?? new Error('scripted pipeline ran out of errors');
      calls += 1;
      throw err;
    },
  } as unknown as AuditPipeline;
  return { pipeline, calls: () => calls };
}

/**
 * A pipeline that never settles, for the deadline case. Nothing ever awaits it
 * to completion, and an unresolved promise does not hold the process open.
 */
function hangingPipeline(): AuditPipeline {
  return { run: () => new Promise<never>(() => undefined) } as unknown as AuditPipeline;
}

const RETRYABLE = (): AuditError => new AuditError('UPSTREAM_FAILED', 'upstream blew up', true);
const PERMANENT = (): AuditError => new AuditError('REPO_NOT_FOUND', 'repository not found', false);

async function openRepo(): Promise<{ db: ReturnType<typeof openIsolatedSqlite>; repo: JobRepository }> {
  const db = openIsolatedSqlite(process.env['DATABASE_URL']!.replace(/^file:/, ''));
  await runMigrations(db);
  return { db, repo: new JobRepository(db) };
}

async function seedQueuedJob(repo: JobRepository, jobId: string): Promise<void> {
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
}

/**
 * Seed a job the way a crashed attempt leaves it: `insert()` hardcodes
 * `startedAt`/`attempts` to null/0 (they are written by the lifecycle, never
 * at creation), so the crashed state has to be built through the same two
 * steps the worker uses — insert, then take.
 */
async function seedCrashedAttempt(
  repo: JobRepository,
  jobId: string,
  startedAt: string,
): Promise<void> {
  await seedQueuedJob(repo, jobId);
  await repo.update(jobId, { status: 'processing', startedAt, attempts: 1 });
}

interface Harness {
  queue: ReturnType<typeof buildAuditQueue>;
  repo: JobRepository;
}

/** A metadata analyzer whose answers are recorded, so a test can assert *how* the SHA was resolved. */
function recordingMetadata(defaultBranch: string | null, headSha: string | null = 'abc123') {
  const calls: { getDefaultBranch: number; getHeadSha: Array<{ owner: string; repo: string; branch: string }> } = {
    getDefaultBranch: 0,
    getHeadSha: [],
  };
  return {
    calls,
    analyzer: {
      getDefaultBranch: async (): Promise<string | null> => {
        calls.getDefaultBranch += 1;
        return defaultBranch;
      },
      getHeadSha: async (owner: string, repo: string, branch: string): Promise<string | null> => {
        calls.getHeadSha.push({ owner, repo, branch });
        return headSha;
      },
    } as unknown as MetadataAnalyzer,
  };
}

/** The real inline queue, over an isolated SQLite database. */
async function harness(options: {
  pipeline: AuditPipeline;
  retryLimit?: number;
  jobTimeoutMs?: number;
  metadataAnalyzer?: MetadataAnalyzer;
  /** Override the cache the worker is handed (used to spy on `getOrCompute`). */
  cache?: CacheService;
}): Promise<Harness> {
  const { db, repo } = await openRepo();
  const queue = buildAuditQueue({
    db,
    dbMode: 'sqlite',
    repo,
    pipeline: options.pipeline,
    cache: options.cache ?? new CacheService({
      repo: new ReportCacheRepository(db),
      enabled: false,
      ttlSeconds: 60,
      log: createLogger({ level: 'silent' }),
    }),
    cacheEnabled: false,
    // Default: the SHA cannot be resolved, which is also the path every
    // failure-contract test above takes — the cache is bypassed and the
    // pipeline's throw is the only thing that decides the outcome.
    metadataAnalyzer: options.metadataAnalyzer ?? recordingMetadata(null).analyzer,
    allowedHosts: ['github.com'],
    driverOverride: 'inline',
    retryLimitOverride: options.retryLimit ?? 1,
    jobTimeoutMsOverride: options.jobTimeoutMs ?? 5_000,
    // Deliberately short. The default 30 s drain is longer than any assertion
    // in this file, so a job that never settles would report vitest's timeout
    // instead of the diagnostic below — and a test whose failure message is
    // "timed out" tells you nothing about which invariant broke.
    shutdownGraceMsOverride: 1_000,
    logOverride: createLogger({ level: 'silent' }),
  });
  await queue.start();
  return { queue, repo };
}

/**
 * Poll until the job is terminal. A poll rather than a sleep, so a slow machine
 * makes a *failure* take longer to report instead of making a passing case
 * flaky.
 */
async function waitForTerminal(repo: JobRepository, jobId: string): Promise<AuditJob> {
  const deadline = Date.now() + 15_000;
  let job = await repo.findById(jobId);
  while (Date.now() < deadline) {
    if (job && (job.status === 'completed' || job.status === 'failed')) return job;
    await new Promise((r) => setTimeout(r, 25));
    job = await repo.findById(jobId);
  }
  throw new Error(
    `job ${jobId} was still ${job?.status ?? '(missing)'} after 15000ms; ` +
      `every failure path in this file is supposed to reach a terminal state`,
  );
}

/** Seed one job, run it through the queue, and wait for it to settle. */
async function runToTerminal(options: {
  jobId: string;
  pipeline: AuditPipeline;
  retryLimit?: number;
  jobTimeoutMs?: number;
}): Promise<AuditJob> {
  const { queue, repo } = await harness(options);
  try {
    await seedQueuedJob(repo, options.jobId);
    await queue.enqueue({ jobId: options.jobId });
    return await waitForTerminal(repo, options.jobId);
  } finally {
    await queue.stop();
  }
}

/**
 * A pipeline that succeeds, so a reclaimed or cache-bypassed job can be
 * observed *completing* rather than failing. The report comes from the real
 * builder because `executeWithCache` runs `ReportSchema.parse` on whatever
 * comes back, and a hand-shaped object that drifts from the schema would test
 * the schema, not the worker.
 */
function succeedingPipeline(): { pipeline: AuditPipeline; calls: () => number } {
  let calls = 0;
  const pipeline = {
    run: async () => {
      calls += 1;
      return { report: minimalReport() };
    },
  } as unknown as AuditPipeline;
  return { pipeline, calls: () => calls };
}

function minimalReport() {
  return new ReportBuilder().build({
    metadata: {
      owner: 'octocat',
      name: 'Hello-World',
      defaultBranch: 'main',
      license: 'MIT',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
      visibility: 'public',
      archived: false,
      stars: 0,
      openIssues: 0,
      openPulls: 0,
      description: 'Test',
      primaryLanguage: 'TypeScript',
      url: 'https://github.com/octocat/Hello-World',
    },
    entries: [{ path: 'README.md', size: 50 }],
    contents: new Map([['README.md', '# Title\n']]),
    truncated: false,
    auditMode: 'quick',
    target: 'open_source',
    outputLanguage: 'en',
    includeLaunchCopy: true,
  }).report;
}

describe('AuditWorker failure contract (inline driver)', () => {
  it('a retryable failure reaches a terminal state', async () => {
    // The headline invariant, and the reason R-43 got its own batch: before
    // this, the row stayed `processing` and nothing left in the process would
    // ever move it.
    const { pipeline, calls } = scriptedPipeline([RETRYABLE()]);
    const job = await runToTerminal({ jobId: 'job_retryable_terminal', pipeline });

    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('UPSTREAM_FAILED');
    expect(job.failedAt).not.toBeNull();
    // retryLimit 1 => one retry => two attempts, both thrown away.
    expect(job.attempts).toBe(2);
    expect(calls()).toBe(2);
  });

  it('spends exactly the configured attempt budget', async () => {
    // The attempt count is what the terminal decision is made from, so a driver
    // and a worker that disagree about it is how a job gets stuck. Pin both
    // ends: the count the worker recorded, and the number of times it was
    // actually asked to run.
    const { pipeline, calls } = scriptedPipeline([RETRYABLE()]);
    const job = await runToTerminal({ jobId: 'job_budget_three', pipeline, retryLimit: 2 });

    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(3);
    expect(calls()).toBe(3);
  });

  it('re-attempts the job rather than dropping the redelivery', async () => {
    // The pg-boss half of R-43, reproduced on the driver that is cheap to test.
    // The retry used to arrive, find the row in `processing`, and be skipped —
    // so a redelivery cost nothing and changed nothing. A retry that does not
    // re-run is indistinguishable from no retry at all, except that it makes
    // `AUDIT_QUEUE_RETRY_LIMIT` look like it is doing something.
    const { pipeline, calls } = scriptedPipeline([RETRYABLE(), PERMANENT()]);
    const job = await runToTerminal({ jobId: 'job_retry_reruns', pipeline });

    expect(calls()).toBe(2);
    expect(job.attempts).toBe(2);
    // The second attempt's classification is the one that gets reported, which
    // is also how we know the second attempt really ran the pipeline.
    expect(job.errorCode).toBe('REPO_NOT_FOUND');
    expect(job.status).toBe('failed');
  });

  it('does not retry a permanent failure', async () => {
    const { pipeline, calls } = scriptedPipeline([PERMANENT()]);
    const job = await runToTerminal({ jobId: 'job_permanent', pipeline });

    expect(calls()).toBe(1);
    expect(job.attempts).toBe(1);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('REPO_NOT_FOUND');
  });

  it('fails a job that outlives its deadline, with a code that says so', async () => {
    // The deadline is the other half of the fix. Without it an audit that hangs
    // — a socket that never times out, an upstream that accepts and then says
    // nothing — is a job that never reaches a terminal state even though every
    // *thrown* error now does.
    const job = await runToTerminal({
      jobId: 'job_deadline',
      pipeline: hangingPipeline(),
      jobTimeoutMs: 150,
      retryLimit: 0,
    });

    expect(job.status).toBe('failed');
    // Not `UPSTREAM_FAILED`: a timeout is retryable, but it is not a report
    // about the upstream — a hung request and a rejected one need different
    // things done about them, and one code cannot say both.
    expect(job.errorCode).toBe('JOB_TIMEOUT');
    expect(job.error).toMatch(/150ms/);
  });

  it('does not re-run a job that already reached a terminal state', async () => {
    // The guarded take is what makes redelivery safe: a job delivered twice
    // must not be audited twice. It is also why the terminal writes are guarded
    // on `processing` — a late write must not clobber a row that settled.
    const { pipeline, calls } = scriptedPipeline([PERMANENT()]);
    const { queue, repo } = await harness({ pipeline });
    try {
      await seedQueuedJob(repo, 'job_delivered_twice');
      await queue.enqueue({ jobId: 'job_delivered_twice' });
      const first = await waitForTerminal(repo, 'job_delivered_twice');
      expect(first.status).toBe('failed');

      // Same job, delivered again. The queue no longer holds it, so this is a
      // genuinely new scheduling of an already-terminal job.
      await queue.enqueue({ jobId: 'job_delivered_twice' });
      await new Promise((r) => setTimeout(r, 250));

      expect(calls()).toBe(1);
      const after = await repo.findById('job_delivered_twice');
      expect(after?.status).toBe('failed');
      expect(after?.attempts).toBe(1);
    } finally {
      await queue.stop();
    }
  });
});

/**
 * R-42: a worker that dies mid-attempt leaves the row in `processing`, and
 * `runOnce` used to treat that as "someone else has it" and return. The
 * redelivery that was supposed to follow the crash therefore found a row it
 * refused to touch, and the buyer polled a 202 forever — for a job they had
 * already paid for.
 *
 * The reclaim is bounded by `staleProcessingMs`, which `build-queue.ts` derives
 * from the queue's own redelivery window (`jobTimeoutMs + 30 s` headroom), so
 * a live worker can never be younger than the bound: its attempt is inside the
 * deadline the bound is derived from.
 */
describe('stale-processing reclaim (R-42)', () => {
  it('reclaims a job a dead worker parked in processing, and completes it', async () => {
    const { pipeline, calls } = succeedingPipeline();
    const { queue, repo } = await harness({ pipeline, retryLimit: 0 });
    try {
      // Exactly what a crashed attempt leaves behind: the take happened,
      // `startedAt` was written, the terminal write never was.
      await seedCrashedAttempt(repo, 'job_crashed_mid_attempt', new Date(Date.now() - 5 * 60_000).toISOString());
      await queue.enqueue({ jobId: 'job_crashed_mid_attempt' });

      const job = await waitForTerminal(repo, 'job_crashed_mid_attempt');
      expect(job.status).toBe('completed');
      expect(job.report).not.toBeNull();
      // One attempt, not zero: the redelivery actually ran the audit instead
      // of being dropped on the floor.
      expect(calls()).toBe(1);
      // Two, not one: the crashed attempt keeps its count. Re-reading it as
      // one would hand every crash a free attempt out of the retry budget.
      expect(job.attempts).toBe(2);
    } finally {
      await queue.stop();
    }
  });

  it('does not touch a processing job a live worker is still holding', async () => {
    // The other half of the bound: a row taken a moment ago must be left
    // alone, or two workers run the same job and one of them burns the
    // buyer's payment for nothing.
    const { pipeline, calls } = succeedingPipeline();
    const { queue, repo } = await harness({ pipeline });
    try {
      await seedCrashedAttempt(repo, 'job_fresh_processing', new Date().toISOString());
      await queue.enqueue({ jobId: 'job_fresh_processing' });
      await new Promise((r) => setTimeout(r, 250));

      expect(calls()).toBe(0);
      const job = await repo.findById('job_fresh_processing');
      expect(job?.status).toBe('processing');
      expect(job?.startedAt).not.toBeNull();
    } finally {
      await queue.stop();
    }
  });
});

/**
 * The cache key is built from `commitSha`, and the SHA used to be resolved by
 * guessing `main`, then `master`, then falling back to the literal string
 * `'unknown'`. Both names are conventions, not guarantees — a repo whose
 * default branch is `develop` or `trunk` 404s on both, and GitHub's 403 under
 * rate limiting collapsed them the same way. The key then read
 * `…/unknown` for *every* audit of such a repo, at *every* commit, so the
 * first report was served for the whole TTL to every subsequent buyer.
 *
 * Two invariants pin the fix: the SHA comes from the repository's *actual*
 * default branch, and an unresolvable SHA disables the cache rather than
 * sharing a bucket under a made-up key.
 */
describe('head SHA resolution and the cache key', () => {
  it('resolves the SHA through the repository default branch, not main/master guesses', async () => {
    const { pipeline, calls } = succeedingPipeline();
    const meta = recordingMetadata('develop', 'deadbeef');
    const { queue, repo } = await harness({ pipeline, metadataAnalyzer: meta.analyzer, retryLimit: 0 });
    try {
      await seedQueuedJob(repo, 'job_develop_branch');
      await queue.enqueue({ jobId: 'job_develop_branch' });
      const job = await waitForTerminal(repo, 'job_develop_branch');

      expect(job.status).toBe('completed');
      expect(calls()).toBe(1);
      // The branch that was asked for is the one the repository reported —
      // neither guess, and no string that could end up in a key.
      expect(meta.calls.getHeadSha).toHaveLength(1);
      expect(meta.calls.getHeadSha[0]).toEqual({
        owner: 'octocat',
        repo: 'Hello-World',
        branch: 'develop',
      });
    } finally {
      await queue.stop();
    }
  });

  it('bypasses the cache entirely when the default branch cannot be resolved', async () => {
    // No branch -> no SHA -> no key. The audit still runs (the buyer paid),
    // but nothing is stored or served under a bucket every other audit of
    // the same repo would share.
    const { pipeline, calls } = succeedingPipeline();
    const meta = recordingMetadata(null);
    const getOrComputeCalls: Array<{ key: string; commitSha: string }> = [];
    // A spy that behaves exactly like a disabled CacheService — compute and
    // report a miss — so the only thing under observation is whether the
    // worker reached for the cache at all.
    const spiedCache = {
      getOrCompute: async (
        key: string,
        _keyVersion: string,
        commitSha: string,
        compute: () => Promise<{ report: Report }>,
      ) => {
        getOrComputeCalls.push({ key, commitSha });
        const result = await compute();
        return { report: result.report, hit: false, keyVersion: 'v1', expiresAt: null };
      },
    } as unknown as CacheService;

    const { queue, repo } = await harness({
      pipeline,
      metadataAnalyzer: meta.analyzer,
      cache: spiedCache,
      retryLimit: 0,
    });
    try {
      await seedQueuedJob(repo, 'job_no_default_branch');
      await queue.enqueue({ jobId: 'job_no_default_branch' });
      const job = await waitForTerminal(repo, 'job_no_default_branch');

      expect(job.status).toBe('completed');
      expect(calls()).toBe(1);
      // The headline: nothing was ever looked up or stored under a key.
      expect(getOrComputeCalls).toHaveLength(0);
      // And the row says so, rather than reporting a hit on a cache it
      // never consulted.
      expect(job.cache).toEqual({ hit: false, keyVersion: 'v1', expiresAt: null });
    } finally {
      await queue.stop();
    }
  });
});
