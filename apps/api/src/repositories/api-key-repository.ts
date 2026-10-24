/**
 * API key repository — issue, look up, revoke.
 *
 * Two backends, one async interface, same shape as `JobRepository`. The hash
 * is the lookup key, so `findActiveByHash` is one indexed comparison; a
 * revoked key is filtered in the query rather than by the caller, because a
 * caller that forgets the filter would accept a revoked credential.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { apiKeys as apiKeysSqlite } from '../db/schema.js';
import { apiKeys as apiKeysPg } from '../db/schema.pg.js';
import type { DB } from '../db/client.js';
import { newApiKeyId } from '../utils/api-key.js';

export interface ApiKeyRecord {
  keyId: string;
  label: string;
  /** `null` means "use the deployment's RATE_LIMIT_PER_MINUTE". */
  rateLimitPerMinute: number | null;
  createdAt: string;
  revokedAt: string | null;
}

function toRecord(row: {
  keyId: string;
  label: string;
  rateLimitPerMinute: number | null;
  createdAt: string;
  revokedAt: string | null;
}): ApiKeyRecord {
  return {
    keyId: row.keyId,
    label: row.label,
    rateLimitPerMinute: row.rateLimitPerMinute,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

export class ApiKeyRepository {
  constructor(private readonly db: DB) {}

  /**
   * Store a key. `keyHash` comes from `hashApiKey`; the plaintext is never
   * passed to this layer, so it cannot end up in a log line or an error.
   */
  async create(input: {
    keyHash: string;
    label: string;
    rateLimitPerMinute?: number | null;
  }): Promise<ApiKeyRecord> {
    const record: ApiKeyRecord = {
      keyId: newApiKeyId(),
      label: input.label,
      rateLimitPerMinute: input.rateLimitPerMinute ?? null,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    const values = { ...record, keyHash: input.keyHash };

    if (this.db.mode === 'sqlite') {
      this.db.db.insert(apiKeysSqlite).values(values).run();
      return record;
    }
    await this.db.db.insert(apiKeysPg).values(values).execute();
    return record;
  }

  /**
   * The key behind a presented credential, or `null` if it is unknown or
   * revoked. Both are the same answer to the caller — a 401 — because telling
   * them apart would confirm that a guessed key once existed.
   */
  async findActiveByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    if (this.db.mode === 'sqlite') {
      const rows = this.db.db
        .select()
        .from(apiKeysSqlite)
        .where(and(eq(apiKeysSqlite.keyHash, keyHash), isNull(apiKeysSqlite.revokedAt)))
        .limit(1)
        .all();
      const row = rows[0];
      return row ? toRecord(row) : null;
    }
    const rows = await this.db.db
      .select()
      .from(apiKeysPg)
      .where(and(eq(apiKeysPg.keyHash, keyHash), isNull(apiKeysPg.revokedAt)))
      .limit(1)
      .execute();
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  /** True when this call was the one that revoked it. */
  async revoke(keyId: string): Promise<boolean> {
    const revokedAt = new Date().toISOString();
    if (this.db.mode === 'sqlite') {
      const existing = this.db.db
        .select()
        .from(apiKeysSqlite)
        .where(eq(apiKeysSqlite.keyId, keyId))
        .limit(1)
        .all()[0];
      if (!existing || existing.revokedAt !== null) return false;
      this.db.db
        .update(apiKeysSqlite)
        .set({ revokedAt })
        .where(eq(apiKeysSqlite.keyId, keyId))
        .run();
      return true;
    }
    const existing = (
      await this.db.db
        .select()
        .from(apiKeysPg)
        .where(eq(apiKeysPg.keyId, keyId))
        .limit(1)
        .execute()
    )[0];
    if (!existing || existing.revokedAt !== null) return false;
    await this.db.db
      .update(apiKeysPg)
      .set({ revokedAt })
      .where(eq(apiKeysPg.keyId, keyId))
      .execute();
    return true;
  }

  /** Newest first. Includes revoked keys; the caller prints the column. */
  async list(): Promise<ApiKeyRecord[]> {
    if (this.db.mode === 'sqlite') {
      return this.db.db
        .select()
        .from(apiKeysSqlite)
        .orderBy(desc(apiKeysSqlite.createdAt))
        .all()
        .map(toRecord);
    }
    const rows = await this.db.db
      .select()
      .from(apiKeysPg)
      .orderBy(desc(apiKeysPg.createdAt))
      .execute();
    return rows.map(toRecord);
  }
}
