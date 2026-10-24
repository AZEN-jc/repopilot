/**
 * The keyGenerator is the security boundary of the rate limiter.
 *
 * It used to return `req.ip`, which the server let follow
 * `X-Forwarded-For` — so the "client address" the limiter keyed on was a
 * header the client wrote. Two exploits, one root cause:
 * `X-Forwarded-For: 127.0.0.1` put the caller in the allow-list (exempt from
 * the limit entirely), and a fresh random value per request reset the bucket
 * every time (unlimited requests, one per "client").
 *
 * The fix: the key is the socket peer unless the peer is a proxy we
 * configured, and a configured proxy contributes the first
 * `X-Forwarded-For` entry found walking in from the right that is *not*
 * also one of ours — every hop a proxy we run appended is skipped, so a
 * second trusted proxy (a load balancer in front of the edge) does not
 * collapse its callers into one bucket. The left-most entry is what the
 * client claimed about itself, and a client can claim anything.
 *
 * These tests drive the real plugin through `app.inject`, with
 * `remoteAddress` standing in for the socket peer and headers for what the
 * client wrote. Nothing here mocks the plugin's key selection, because the
 * plugin's key selection is the thing under test.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerRateLimit, registerIdentityAndRateLimit } from './rate-limit.js';
import { hashApiKey } from '../utils/api-key.js';
import type { ApiKeyRecord } from '../repositories/api-key-repository.js';

let app: FastifyInstance | undefined;

async function buildApp(opts: { perMinute: number; trustedProxyIps?: string[] }): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await registerRateLimit(instance, opts);
  instance.get('/ping', async () => ({ ok: true }));
  await instance.ready();
  return instance;
}

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

function get(remoteAddress: string, headers: Record<string, string> = {}) {
  return app!.inject({ method: 'GET', url: '/ping', remoteAddress, headers });
}

describe('registerRateLimit key selection', () => {
  it('keys by the socket peer and refuses past the budget', async () => {
    // The baseline: two requests per minute from one address, then 429.
    // Without this the other tests have nothing to compare against.
    app = await buildApp({ perMinute: 2 });
    expect((await get('203.0.113.7')).statusCode).toBe(200);
    expect((await get('203.0.113.7')).statusCode).toBe(200);
    expect((await get('203.0.113.7')).statusCode).toBe(429);
  });

  it('ignores a forged X-Forwarded-For from an untrusted peer', async () => {
    // The headline exploit. The third request is refused even though it
    // claims to be a different client, because the claim is not the peer.
    app = await buildApp({ perMinute: 2 });
    const forged = { 'x-forwarded-for': '198.51.100.9' };
    expect((await get('203.0.113.7')).statusCode).toBe(200);
    expect((await get('203.0.113.7', forged)).statusCode).toBe(200);
    expect((await get('203.0.113.7', forged)).statusCode).toBe(429);
    // A *different* header value does not open a fresh bucket either: the
    // bucket belongs to the peer, not to anything in the request.
    expect((await get('203.0.113.7', { 'x-forwarded-for': '198.51.100.10' })).statusCode).toBe(429);
  });

  it('uses the right-most X-Forwarded-For entry when the peer is a trusted proxy', async () => {
    // A proxy appends the client address at the right; the left-most entry
    // is the client's own claim. Keying by the claim would let one client
    // spend another client's budget by naming it first.
    app = await buildApp({ perMinute: 2, trustedProxyIps: ['10.0.0.1'] });
    const via = (client: string) => get('10.0.0.1', { 'x-forwarded-for': `1.2.3.4, ${client}` });

    expect((await via('198.51.100.10')).statusCode).toBe(200);
    expect((await via('198.51.100.10')).statusCode).toBe(200);
    // Same claimed left-most, different right-most: a different bucket,
    // because the bucket belongs to the address the proxy actually saw.
    expect((await via('198.51.100.11')).statusCode).toBe(200);
    // And the first client is now over its own budget.
    expect((await via('198.51.100.10')).statusCode).toBe(429);
  });

  it('does not let an untrusted caller reach the allow-list by writing a header', async () => {
    // The second half of the same exploit: naming an allow-listed address
    // in the header must not exempt the caller. The allow-list matches the
    // key, and the key is the peer unless the peer is a configured proxy —
    // so this caller spends the same budget as anyone else, header or not.
    app = await buildApp({ perMinute: 2, trustedProxyIps: ['10.0.0.1'] });
    const asProxy = { 'x-forwarded-for': '10.0.0.1' };
    expect((await get('203.0.113.7', asProxy)).statusCode).toBe(200);
    expect((await get('203.0.113.7', asProxy)).statusCode).toBe(200);
    // Were the header believed, every one of these would be 200.
    for (let i = 0; i < 3; i += 1) {
      expect((await get('203.0.113.7', asProxy)).statusCode).toBe(429);
    }
  });

  it('exempts a trusted proxy that forwards no X-Forwarded-For', async () => {
    // The allow-list keeps its original purpose: our own proxy, reaching us
    // directly (health checks, internal calls), is not a client to throttle.
    app = await buildApp({ perMinute: 1, trustedProxyIps: ['10.0.0.1'] });
    for (let i = 0; i < 3; i += 1) {
      expect((await get('10.0.0.1')).statusCode).toBe(200);
    }
  });

  it('separates callers behind the compose edge, and collapses them without it', async () => {
    // The shipped topology, at the address it actually uses. `web` proxies to
    // `api:4000` over the compose bridge, so the peer the API sees is nginx's
    // *container* address — `172.28.0.10`, which `docker-compose.yml` pins and
    // names in `TRUSTED_PROXY_IPS`. Loopback never appears. This is the half
    // that makes the variable load-bearing: with the address named, each caller
    // spends its own budget.
    app = await buildApp({ perMinute: 1, trustedProxyIps: ['172.28.0.10'] });
    const via = (client: string) => get('172.28.0.10', { 'x-forwarded-for': client });
    expect((await via('198.51.100.10')).statusCode).toBe(200);
    expect((await via('198.51.100.11')).statusCode).toBe(200);
    expect((await via('198.51.100.10')).statusCode).toBe(429);

    // The other half, and the reason `compose:check` gates the wiring: the
    // same two callers against the same peer, with the built-in loopback
    // default — i.e. an edge address the API was never told about. Both land
    // in one bucket. Not a bypass; a shared 60/min for the whole internet,
    // which only shows up under load.
    //
    // `afterEach` only closes the last instance, so this one is closed here.
    await app.close();
    app = await buildApp({ perMinute: 1 });
    expect((await via('198.51.100.10')).statusCode).toBe(200);
    expect((await via('198.51.100.11')).statusCode).toBe(429);
  });

  it('walks past every proxy we run, not just the last one', async () => {
    // A load balancer in front of the edge is a normal deployment, and it is
    // where "take the right-most entry" stops being the client. The chain
    // arrives at the API as `<client's own claim>, <real client>, <balancer>`:
    // the right-most entry is the balancer, so keying on it would put every
    // caller behind that balancer into one bucket — the outage, from the
    // inside. The walk skips the balancer too, because it is ours.
    app = await buildApp({ perMinute: 1, trustedProxyIps: ['10.0.0.1', '10.0.0.2'] });
    const viaBalancer = (client: string) =>
      get('10.0.0.1', { 'x-forwarded-for': `1.2.3.4, ${client}, 10.0.0.2` });

    expect((await viaBalancer('198.51.100.10')).statusCode).toBe(200);
    // A different caller behind the same balancer gets its own bucket.
    expect((await viaBalancer('198.51.100.11')).statusCode).toBe(200);
    // And the first one is over its own budget, not the balancer's.
    expect((await viaBalancer('198.51.100.10')).statusCode).toBe(429);
  });

  it('keys on the peer when every hop in the chain is one of ours', async () => {
    // The fallback. Nothing in the header is a client, so the peer is the most
    // specific address left — and it is allow-listed, so this traffic is
    // exempt. Stated as a test because "walked off the left end" must not mean
    // "return undefined" or "return the last address anyway".
    app = await buildApp({ perMinute: 1, trustedProxyIps: ['10.0.0.1', '10.0.0.2'] });
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await get('10.0.0.1', { 'x-forwarded-for': '10.0.0.2, 10.0.0.1' })).statusCode,
      ).toBe(200);
    }
  });
});

/**
 * The key is a second identity axis, and the one that matters for callers
 * behind a shared egress.
 *
 * These cases mount both middlewares through `registerIdentityAndRateLimit`
 * rather than testing `keyGenerator` in isolation, because what they assert is
 * the composition: a request carrying a key is limited on the key's bucket,
 * and a request without one is limited on its address. Testing the generator
 * alone would pass with the auth hook missing entirely.
 *
 * The *order* of the two is not observable here — the auth hook is on the root
 * instance and the limiter is an encapsulated plugin, so Fastify runs auth
 * first whichever line comes first. Swapping them was measured and these tests
 * stayed green. The combined registration exists for the day the limiter is
 * inlined, not because this ordering is load-bearing today.
 */
function keyRecord(keyId: string, rateLimitPerMinute: number | null): ApiKeyRecord {
  return { keyId, label: keyId, rateLimitPerMinute, createdAt: '2026-10-24T00:00:00.000Z', revokedAt: null };
}

const KEY_A = 'rp_key_a_0000000000000000000000000';
const KEY_B = 'rp_key_b_0000000000000000000000000';
const KEY_C = 'rp_key_c_0000000000000000000000000';

const KEYS = new Map<string, ApiKeyRecord>([
  [hashApiKey(KEY_A), keyRecord('key_a', null)],
  [hashApiKey(KEY_B), keyRecord('key_b', null)],
  [hashApiKey(KEY_C), keyRecord('key_c', 1)],
]);

async function buildAppWithKeys(opts: {
  perMinute: number;
  trustedProxyIps?: string[];
}): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await registerIdentityAndRateLimit(instance, {
    repo: {
      async findActiveByHash(hash) {
        return KEYS.get(hash) ?? null;
      },
    },
    ...opts,
  });
  instance.get('/ping', async () => ({ ok: true }));
  await instance.ready();
  return instance;
}

function getWithKey(key?: string, remoteAddress = '203.0.113.7') {
  return app!.inject({
    method: 'GET',
    url: '/ping',
    remoteAddress,
    ...(key ? { headers: { 'x-api-key': key } } : {}),
  });
}

describe('registerRateLimit with API keys', () => {
  it('gives each key its own bucket and leaves the address bucket untouched', async () => {
    app = await buildAppWithKeys({ perMinute: 2 });

    expect((await getWithKey(KEY_A)).statusCode).toBe(200);
    expect((await getWithKey(KEY_A)).statusCode).toBe(200);
    expect((await getWithKey(KEY_A)).statusCode).toBe(429);

    // B has spent nothing, and neither has the address A came from.
    expect((await getWithKey(KEY_B)).statusCode).toBe(200);
    expect((await getWithKey()).statusCode).toBe(200);
    expect((await getWithKey()).statusCode).toBe(200);
    expect((await getWithKey()).statusCode).toBe(429);
  });

  it('honours a per-key limit instead of the deployment default', async () => {
    app = await buildAppWithKeys({ perMinute: 5 });
    expect((await getWithKey(KEY_C)).statusCode).toBe(200);
    expect((await getWithKey(KEY_C)).statusCode).toBe(429);
    // Everyone else still gets the deployment default.
    expect((await getWithKey(KEY_A)).statusCode).toBe(200);
  });

  it('does not let a key from an allow-listed address bypass the limit', async () => {
    // `allowList` matches the generated key, and a key-bearing request keys on
    // `key:<id>` — so loopback is not exempt when it presents a credential.
    app = await buildAppWithKeys({
      perMinute: 1,
      trustedProxyIps: ['203.0.113.7'],
    });
    expect((await getWithKey(KEY_B)).statusCode).toBe(200);
    expect((await getWithKey(KEY_B)).statusCode).toBe(429);
    // Without a key, the same address is still allow-listed.
    expect((await getWithKey()).statusCode).toBe(200);
  });
});
