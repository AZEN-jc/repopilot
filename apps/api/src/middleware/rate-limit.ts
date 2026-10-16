/**
 * Rate limiting.
 *
 * The key is the one thing this module gets to decide, and the only address
 * it may trust is the one the socket reported — everything else arrived in a
 * header the client wrote.
 */
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export async function registerRateLimit(
  app: FastifyInstance,
  opts: { perMinute: number; trustedProxyIps?: string[] },
) {
  const trusted = new Set(opts.trustedProxyIps ?? []);
  await app.register(rateLimit, {
    max: opts.perMinute,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      // `req.ip` is deliberately not used: the server registers with
      // `trustProxy: true`, which makes `req.ip` follow `X-Forwarded-For` —
      // so it is exactly as forgeable as the header itself. The socket peer
      // is the only address this process did not read off the request.
      const peer = req.socket.remoteAddress ?? '';
      if (trusted.has(peer)) {
        // A proxy we run. The right-most entry is the one *it* appended,
        // which is the client's address; the left-most is what the client
        // claimed, and a client can claim anything.
        const fwd = req.headers['x-forwarded-for'];
        if (typeof fwd === 'string' && fwd.trim()) {
          return fwd.split(',').pop()!.trim() || peer;
        }
      }
      return peer;
    },
    // Matched against the key, which is the socket peer unless the peer is a
    // trusted proxy. So the allow-list is no longer reachable by writing a
    // header: `X-Forwarded-For: 127.0.0.1` used to put the caller in it,
    // exempting them from the limit entirely, and a fresh random value per
    // request used to reset the bucket every time. (R-24.)
    allowList: [...trusted],
  });
}
