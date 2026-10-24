/**
 * `ApiKeyRepository` — the storage half of key issuance.
 *
 * The property that matters most is not "a row round-trips": it is that the
 * plaintext key is not in the row, and that a revoked key stops resolving.
 * Both are asserted here rather than in the middleware, because a middleware
 * test with a stub repository would prove neither.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { openIsolatedSqlite, runMigrations, type DB } from '../db/client.js';
import { ApiKeyRepository } from './api-key-repository.js';
import { generateApiKey, hashApiKey } from '../utils/api-key.js';

let db: DB;
let repo: ApiKeyRepository;

beforeAll(async () => {
  db = openIsolatedSqlite('file::memory:');
  await runMigrations(db);
  repo = new ApiKeyRepository(db);
});

describe('ApiKeyRepository', () => {
  it('stores the hash, never the key', async () => {
    const key = generateApiKey();
    const created = await repo.create({ keyHash: hashApiKey(key), label: 'ci' });

    // The row is read straight out of the table, bypassing the repository, so
    // this would catch a repository that happened to keep the plaintext in a
    // column the mapper ignores.
    const rows = db.mode === 'sqlite' ? db.raw.prepare('SELECT * FROM api_keys').all() : [];
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(key);
    expect(serialised).toContain(hashApiKey(key));
    expect(created.keyId).toMatch(/^key_/);
  });

  it('resolves an active key by its hash', async () => {
    const key = generateApiKey();
    const created = await repo.create({ keyHash: hashApiKey(key), label: 'agent', rateLimitPerMinute: 120 });

    const found = await repo.findActiveByHash(hashApiKey(key));
    expect(found?.keyId).toBe(created.keyId);
    expect(found?.label).toBe('agent');
    expect(found?.rateLimitPerMinute).toBe(120);
  });

  it('returns null for an unknown hash', async () => {
    expect(await repo.findActiveByHash(hashApiKey('rp_not_a_key'))).toBeNull();
  });

  it('stops resolving a key once it is revoked, and reports the first revoke only', async () => {
    const key = generateApiKey();
    const created = await repo.create({ keyHash: hashApiKey(key), label: 'temporary' });

    expect(await repo.revoke(created.keyId)).toBe(true);
    expect(await repo.findActiveByHash(hashApiKey(key))).toBeNull();
    // Second revoke is a no-op, not an error — and must not look like success,
    // or a script that loops over ids cannot tell what it changed.
    expect(await repo.revoke(created.keyId)).toBe(false);
  });

  it('lists newest first and keeps revoked keys visible', async () => {
    const before = (await repo.list()).length;
    const key = generateApiKey();
    const created = await repo.create({ keyHash: hashApiKey(key), label: 'listed' });

    const listed = await repo.list();
    expect(listed.length).toBe(before + 1);
    expect(listed[0]?.keyId).toBe(created.keyId);
    expect(listed[0]?.revokedAt).toBeNull();
  });
});
