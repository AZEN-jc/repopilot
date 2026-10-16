/**
 * The keyGenerator is the security boundary of the rate limiter.
 *
 * It used to return `req.ip`. The server runs with `trustProxy: true`, which
 * makes `req.ip` follow `X-Forwarded-For` — so the "client address" the
 * limiter keyed on was a header the client wrote. Two exploits, one root
 * cause: `X-Forwarded-For: 127.0.0.1` put the caller in the allow-list
 * (exempt from the limit entirely), and a fresh random value per request
 * reset the bucket every time (unlimited requests, one per "client").
 *
 * The fix: the key is the socket peer unless the peer is a proxy we
 * configured, and a configured proxy contributes the *right-most*
 * X-Forwarded-For entry — the address it appended — because the left-most
 * is what the client claimed about itself.
 *
 * These tests drive the real plugin through `app.inject`, with
 * `remoteAddress` standing in for the socket peer and headers for what the
 * client wrote. Nothing here mocks the plugin's key selection, because the
 * plugin's key selection is the thing under test.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerRateLimit } from './rate-limit.js';

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
});
