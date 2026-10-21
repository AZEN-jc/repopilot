/**
 * Job repository — typed CRUD on top of Drizzle.
 *
 * Supports both the SQLite backend (better-sqlite3, sync API) and the
 * Postgres backend (node-postgres, async API). The repository abstracts
 * over both with an `async` interface; SQLite calls complete in <1 ms
 * but are still awaited.
 */
import { and, desc, eq } from 'drizzle-orm';
import { jobs as jobsSqlite, type JobRow as JobRowSqlite } from '../db/schema.js';
import { jobs as jobsPg, type PgJobRow } from '../db/schema.pg.js';
import type { DB } from '../db/client.js';
import type { AuditJob, CreateAuditInput, Report } from '@repopilot/core';

type AnyJobRow = JobRowSqlite | PgJobRow;

/**
 * Was this error `uq_jobs_idempotency_key` refusing a second row for one key?
 *
 * Both drivers report a unique violation differently and neither shares a
 * shape with the other, so the discrimination lives here — next to the two
 * schema files and the two index names — rather than in a caller that would
 * have to guess. The alternative, catching every insert failure and re-reading
 * the key, would turn a genuine database error into "someone else won the
 * race", which is a worse lie than the 500 it replaced.
 *
 * Postgres: `code: '23505'` plus the violated index in `constraint`. The
 * `payment_id` index is unique too, and a collision there is a different
 * event — a duplicate payment proof — so the constraint name is checked.
 * SQLite (better-sqlite3): `SQLITE_CONSTRAINT_UNIQUE` (or plain
 * `SQLITE_CONSTRAINT`) with the table and column in the message, because
 * SQLite has no index names in constraint errors.
 */
export function isIdempotencyKeyCollision(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === '23505') return e.constraint === 'uq_jobs_idempotency_key';
  if (typeof e.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT')) {
    return typeof e.message === 'string' && e.message.includes('jobs.idempotency_key');
  }
  return false;
}

export interface JobLifecyclePatch {
  status?: AuditJob['status'];
  report?: Report | null;
  paymentId?: string | null;
  error?: string | null;
  errorCode?: string | null;
  attempts?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  idempotencyKey?: string | null;
  cacheJson?: string | null;
  commitSha?: string | null;
}

/**
 * Repository identity, supplied by the caller that already parsed the
 * URL. The repository never parses `repoUrl` itself — host allow-listing
 * must stay in one place (`parseRepoUrl`).
 *
 * `mode` and `target` are read off `job.input`, so only owner/repo are
 * required here.
 */
export interface JobRepoIdentity {
  owner: string;
  repo: string;
}

export class JobRepository {
  constructor(private db: DB) {}

  /**
   * Insert a job, with its idempotency key in the same statement.
   *
   * The key used to be written by a second statement (`create()` inserted the
   * row and then updated it), which left two windows: a crash between the two
   * left a queued job with no key, and two concurrent first uses of one key
   * both passed the "does it exist" check, both inserted, and the second update
   * hit `uq_jobs_idempotency_key` and surfaced as a 500 (R-66). One statement
   * closes both; the collision it can still raise is a fact about the race
   * rather than a bug, and `isIdempotencyKeyCollision` is how the caller tells
   * that collision apart from every other insert failure.
   */
  async insert(
    job: AuditJob,
    identity?: JobRepoIdentity,
    idempotencyKey?: string | null,
  ): Promise<void> {
    // Nullable by design: a caller that has no parsed identity leaves the
    // history columns NULL, and history queries simply skip those rows.
    const values = {
      jobId: job.jobId,
      status: job.status,
      inputJson: JSON.stringify(job.input),
      reportJson: null,
      paymentId: job.paymentId,
      error: job.error,
      attempts: '0',
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorCode: null,
      idempotencyKey: idempotencyKey ?? null,
      cacheJson: null,
      owner: identity?.owner ?? null,
      repo: identity?.repo ?? null,
      commitSha: null,
      mode: job.input.mode ?? null,
      target: job.input.target ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    if (this.db.mode === 'sqlite') {
      this.db.db.insert(jobsSqlite).values(values).run();
      return;
    }
    await this.db.db.insert(jobsPg).values(values).execute();
  }

  /**
   * Update a job. Status changes can be guarded by `expectedStatus` so the
   * state machine (queued -> processing -> completed | failed) cannot be
   * corrupted by concurrent worker invocations.
   */
  async update(
    jobId: string,
    patch: JobLifecyclePatch,
    expectedStatus?: AuditJob['status'],
  ): Promise<{ updated: boolean }> {
    const updatedAt = new Date().toISOString();
    const scalar = scalarColumns(patch);
    if (this.db.mode === 'sqlite') {
      const updates: Partial<JobRowSqlite> = { ...scalar, updatedAt };
      if (patch.report !== undefined) {
        updates.reportJson = patch.report ? JSON.stringify(patch.report) : null;
      }

      const where = expectedStatus
        ? and(eq(jobsSqlite.jobId, jobId), eq(jobsSqlite.status, expectedStatus))
        : eq(jobsSqlite.jobId, jobId);
      const result = this.db.db.update(jobsSqlite).set(updates).where(where).run();
      return { updated: result.changes > 0 };
    }
    const updates: Partial<PgJobRow> = { ...scalar, updatedAt };
    if (patch.report !== undefined) {
      updates.reportJson = patch.report ? (patch.report as unknown as object) : null;
    }

    const conditions = expectedStatus
      ? and(eq(jobsPg.jobId, jobId), eq(jobsPg.status, expectedStatus))
      : eq(jobsPg.jobId, jobId);
    const setSql = this.db.db.update(jobsPg).set(updates).where(conditions);
    const result = await setSql.execute();
    return { updated: (result.rowCount ?? 0) > 0 };
  }

  async findById(jobId: string): Promise<AuditJob | null> {
    if (this.db.mode === 'sqlite') {
      const row = this.db.db.select().from(jobsSqlite).where(eq(jobsSqlite.jobId, jobId)).get();
      return row ? rowToJob(row) : null;
    }
    const rows = await this.db.db.select().from(jobsPg).where(eq(jobsPg.jobId, jobId)).limit(1);
    const row = rows[0];
    return row ? rowToJob(row) : null;
  }

  async findByPaymentId(paymentId: string): Promise<AuditJob | null> {
    if (this.db.mode === 'sqlite') {
      const row = this.db.db.select().from(jobsSqlite).where(eq(jobsSqlite.paymentId, paymentId)).get();
      return row ? rowToJob(row) : null;
    }
    const rows = await this.db.db.select().from(jobsPg).where(eq(jobsPg.paymentId, paymentId)).limit(1);
    const row = rows[0];
    return row ? rowToJob(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<AuditJob | null> {
    if (this.db.mode === 'sqlite') {
      const row = this.db.db.select().from(jobsSqlite).where(eq(jobsSqlite.idempotencyKey, key)).get();
      return row ? rowToJob(row) : null;
    }
    const rows = await this.db.db.select().from(jobsPg).where(eq(jobsPg.idempotencyKey, key)).limit(1);
    const row = rows[0];
    return row ? rowToJob(row) : null;
  }

  /**
   * The most recent jobs, newest first.
   *
   * A diagnostic probe, not a feature: the only caller is `/health`, which is
   * asking whether the table is readable at all. It answered a different
   * question on each driver, and both answers were wrong in their own way.
   *
   * SQLite read **every** row — including the full report text of each — and
   * sliced the last `limit` in memory, so a health poll on an install with a
   * few hundred audits materialised all of them to look at one, on every poll,
   * for as long as a monitor was running. Postgres asked for `LIMIT n` with no
   * `ORDER BY`, which returns *some* n rows: fine for "is the table there",
   * nondeterministic for anything else, and a different answer from SQLite's
   * for the same call.
   *
   * `created_at` is indexed on both backends, so the `ORDER BY … LIMIT` is a
   * backward index scan of n rows rather than a full read.
   */
  async list(limit = 50): Promise<AuditJob[]> {
    if (this.db.mode === 'sqlite') {
      return this.db.db
        .select()
        .from(jobsSqlite)
        .orderBy(desc(jobsSqlite.createdAt))
        .limit(limit)
        .all()
        .map(rowToJob);
    }
    const rows = await this.db.db
      .select()
      .from(jobsPg)
      .orderBy(desc(jobsPg.createdAt))
      .limit(limit);
    return rows.map(rowToJob);
  }

  /**
   * Audit history for one repository, newest first.
   *
   * Rows written before the identity columns existed carry NULL
   * owner/repo and are intentionally excluded rather than guessed at.
   */
  async listByRepo(owner: string, repo: string, limit = 20): Promise<AuditJob[]> {
    if (this.db.mode === 'sqlite') {
      return this.db.db
        .select()
        .from(jobsSqlite)
        .where(and(eq(jobsSqlite.owner, owner), eq(jobsSqlite.repo, repo)))
        .orderBy(desc(jobsSqlite.createdAt))
        .limit(limit)
        .all()
        .map(rowToJob);
    }
    const rows = await this.db.db
      .select()
      .from(jobsPg)
      .where(and(eq(jobsPg.owner, owner), eq(jobsPg.repo, repo)))
      .orderBy(desc(jobsPg.createdAt))
      .limit(limit);
    return rows.map(rowToJob);
  }
}

/**
 * The lifecycle fields whose column name and value are identical on both
 * backends. `reportJson` is excluded: SQLite stores it as a JSON string and
 * Postgres as JSONB, so the two branches serialise it differently.
 */
function scalarColumns(
  patch: JobLifecyclePatch,
): Omit<Partial<JobRowSqlite>, 'updatedAt' | 'reportJson'> {
  const out: Omit<Partial<JobRowSqlite>, 'updatedAt' | 'reportJson'> = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.paymentId !== undefined) out.paymentId = patch.paymentId;
  if (patch.error !== undefined) out.error = patch.error;
  if (patch.errorCode !== undefined) out.errorCode = patch.errorCode;
  if (patch.attempts !== undefined) out.attempts = String(patch.attempts);
  if (patch.startedAt !== undefined) out.startedAt = patch.startedAt;
  if (patch.completedAt !== undefined) out.completedAt = patch.completedAt;
  if (patch.failedAt !== undefined) out.failedAt = patch.failedAt;
  if (patch.idempotencyKey !== undefined) out.idempotencyKey = patch.idempotencyKey;
  if (patch.cacheJson !== undefined) out.cacheJson = patch.cacheJson;
  if (patch.commitSha !== undefined) out.commitSha = patch.commitSha;
  return out;
}

function rowToJob(row: AnyJobRow): AuditJob {
  // JSON columns can come back as either a string (SQLite) or already-parsed
  // (Postgres JSONB). Normalise here.
  const inputRaw = (row as { inputJson: unknown }).inputJson;
  const reportRaw = (row as { reportJson: unknown }).reportJson;
  const errorCodeRaw = (row as { errorCode?: string | null }).errorCode ?? null;
  const startedAtRaw = (row as { startedAt?: string | null }).startedAt ?? null;
  const completedAtRaw = (row as { completedAt?: string | null }).completedAt ?? null;
  const failedAtRaw = (row as { failedAt?: string | null }).failedAt ?? null;
  const attemptsRaw = (row as { attempts?: number | string }).attempts ?? 0;
  const idempotencyKeyRaw = (row as { idempotencyKey?: string | null }).idempotencyKey ?? null;
  const commitShaRaw = (row as { commitSha?: string | null }).commitSha ?? null;
  const cacheRaw = (row as { cacheJson?: string | null | object }).cacheJson ?? null;
  let cacheField: { hit: boolean; keyVersion: string; expiresAt: string | null } | null = null;
  if (cacheRaw !== null && cacheRaw !== undefined && cacheRaw !== '') {
    const parsed = typeof cacheRaw === 'string' ? (JSON.parse(cacheRaw) as { hit: boolean; keyVersion: string; expiresAt: string | null }) : (cacheRaw as { hit: boolean; keyVersion: string; expiresAt: string | null });
    cacheField = {
      hit: Boolean(parsed.hit),
      keyVersion: String(parsed.keyVersion ?? 'v1'),
      expiresAt: parsed.expiresAt ?? null,
    };
  }
  return {
    jobId: row.jobId,
    status: row.status as AuditJob['status'],
    input: typeof inputRaw === 'string' ? (JSON.parse(inputRaw) as CreateAuditInput) : (inputRaw as CreateAuditInput),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    paymentId: row.paymentId,
    report: reportRaw === null || reportRaw === undefined
      ? null
      : typeof reportRaw === 'string'
        ? (JSON.parse(reportRaw) as Report)
        : (reportRaw as Report),
    error: row.error,
    errorCode: errorCodeRaw,
    startedAt: startedAtRaw,
    completedAt: completedAtRaw,
    failedAt: failedAtRaw,
    attempts: typeof attemptsRaw === 'string' ? Number(attemptsRaw) : attemptsRaw,
    idempotencyKey: idempotencyKeyRaw,
    commitSha: commitShaRaw,
    cache: cacheField,
  };
}
