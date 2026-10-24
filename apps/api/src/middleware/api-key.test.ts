/**
 * `registerApiKeyAuth` — identification, and the three answers it can give.
 *
 * A stub repository is the right seam here: the lookup's behaviour is
 * `api-key-repository.test.ts`'s job, and what this file has to prove is the
 * contract around it — absent key is anonymous, bad key is 401, good key is
 * attached to the request.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerApiKeyAuth } from './api-key.js';
import { hashApiKey } from '../utils/api-key.js';
import type { ApiKeyRecord } from '../repositories/api-key-repository.js';

const GOOD_KEY = 'rp_good_key_000000000000000000000000';

const RECORD: ApiKeyRecord = {
  keyId: 'key_1',
  label: 'test',
  rateLimitPerMinute: 120,
  createdAt: '2026-10-24T00:00:00.000Z',
  revokedAt: null,
};

async function appWith(repo: { findActiveByHash: (hash: string) => Promise<ApiKeyRecord | null> }) {
  const app = Fastify({ logger: false });
  registerApiKeyAuth(app, { repo });
  app.get('/whoami', async (req) => ({ apiKey: req.apiKey }));
  return app;
}

const acceptsGoodKey = {
  async findActiveByHash(hash: string) {
    return hash === hashApiKey(GOOD_KEY) ? RECORD : null;
  },
};

describe('registerApiKeyAuth', () => {
  it('leaves an anonymous request anonymous', async () => {
    const app = await appWith(acceptsGoodKey);
    const res = await app.inject({ method: 'GET', url: '/whoami' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ apiKey: null });
    await app.close();
  });

  it('accepts X-API-Key and attaches the principal', async () => {
    const app = await appWith(acceptsGoodKey);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-api-key': GOOD_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      apiKey: { keyId: 'key_1', label: 'test', rateLimitPerMinute: 120 },
    });
    await app.close();
  });

  it('accepts Authorization: Bearer', async () => {
    const app = await appWith(acceptsGoodKey);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${GOOD_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiKey.keyId).toBe('key_1');
    await app.close();
  });

  it('rejects a presented key that does not resolve', async () => {
    const app = await appWith(acceptsGoodKey);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { 'x-api-key': 'rp_wrong_key' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_API_KEY');
    await app.close();
  });

  it('rejects a revoked key the same way it rejects an unknown one', async () => {
    // The repository filters revoked rows, so from here they are the same
    // `null`. Asserting it keeps a future refactor from answering 403 here,
    // which would tell a caller their guess used to be valid.
    const app = await appWith({ async findActiveByHash() { return null; } });
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${GOOD_KEY}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_API_KEY');
    await app.close();
  });

  it('ignores a non-Bearer Authorization scheme rather than rejecting it', async () => {
    const app = await appWith(acceptsGoodKey);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ apiKey: null });
    await app.close();
  });
});
