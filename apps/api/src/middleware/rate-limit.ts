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
      // `req.ip` is deliberately not used. This module is the one place that
      // decides who the client is, and it decides from the socket rather than
      // from a value another option can change. (`server.ts` sets `trustProxy`
      // to this same list, so `req.ip` agrees — but that agreement is a
      // consequence of two things being configured alike, not a dependency.
      // The limiter was made independent of `trustProxy` precisely because
      // `trustProxy` was wrong.)
      const peer = req.socket.remoteAddress ?? '';
      if (!trusted.has(peer)) return peer;

      // A proxy we run. Walk in from the right, past every address that is also
      // ours: the first one that is not is the client. The right-most entry is
      // what the last proxy appended; the left-most is what the client claimed
      // about itself, and a client can claim anything.
      //
      // Walking rather than taking `.pop()` matters as soon as two proxies we
      // run are in the chain — a load balancer in front of the edge. The
      // right-most entry is then the balancer, and keying on it would put every
      // caller behind that balancer into one bucket, which is the outage this
      // whole file exists to prevent. With one hop the walk returns the same
      // entry `.pop()` did.
      const fwd = req.headers['x-forwarded-for'];
      if (typeof fwd !== 'string' || !fwd.trim()) return peer;
      const chain = fwd.split(',').map((s) => s.trim()).filter(Boolean);
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        const addr = chain[i]!;
        if (!trusted.has(addr)) return addr;
      }
      // Every hop named a proxy we run. Nothing in the header is a client, so
      // the peer is the most specific thing left to key on.
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
