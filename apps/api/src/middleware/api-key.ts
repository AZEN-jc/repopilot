/**
 * API key authentication — identification, not authorisation.
 *
 * A valid key answers "which caller is this", and that is all it answers. It
 * does not bypass payment: the audit route still demands an `X-PAYMENT` proof
 * for a paid gate, and a key never changes the price. What it changes is the
 * rate-limit bucket — a caller behind a shared NAT, or an agent running on a
 * rotating IP, gets one bucket that follows the key instead of the address.
 *
 * An absent key is not an error: anonymous callers keep working exactly as
 * before, keyed by address. A *presented* key that does not resolve is a 401,
 * because silently downgrading a bad credential to anonymous hides a
 * misconfiguration until the caller wonders why their limit never moved.
 *
 * This hook runs before the rate limiter's, and the reason is encapsulation
 * rather than registration order: this is a root-level `onRequest` hook, the
 * limiter is an encapsulated plugin, and Fastify runs a parent's hooks first.
 * The two are registered together in `registerIdentityAndRateLimit` so that
 * relationship is visible where it is created.
 */
import type { FastifyInstance } from 'fastify';
import { hashApiKey, readApiKey } from '../utils/api-key.js';
import type { ApiKeyRepository } from '../repositories/api-key-repository.js';

export interface ApiKeyPrincipal {
  /** Public handle, safe to log. */
  keyId: string;
  label: string;
  /** `null` means the deployment default applies. */
  rateLimitPerMinute: number | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey: ApiKeyPrincipal | null;
  }
}

export function registerApiKeyAuth(
  app: FastifyInstance,
  // Only the lookup is needed here. Narrowing the dependency keeps the test
  // from having to build a repository to assert a 401.
  deps: { repo: Pick<ApiKeyRepository, 'findActiveByHash'> },
): void {
  // `null` rather than `undefined`: Fastify requires a value to decorate
  // with, and every request gets the property whether or not it sent a key.
  app.decorateRequest('apiKey', null);

  app.addHook('onRequest', async (request, reply) => {
    const presented = readApiKey(request.headers);
    if (presented === null) return;

    const record = await deps.repo.findActiveByHash(hashApiKey(presented));
    if (!record) {
      // Same answer for "unknown" and "revoked": distinguishing them tells a
      // caller that a guessed key once existed.
      return reply.status(401).send({
        error: {
          code: 'INVALID_API_KEY',
          message: 'The API key is not valid. It may have been revoked.',
        },
      });
    }

    request.apiKey = {
      keyId: record.keyId,
      label: record.label,
      rateLimitPerMinute: record.rateLimitPerMinute,
    };
  });
}
