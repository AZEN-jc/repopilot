/**
 * API key format and hashing.
 *
 * A key is `rp_` plus 32 base64url characters (24 random bytes). The prefix
 * exists so a leaked key is recognisable in a log or a paste, and so a
 * `git grep` for `rp_` finds the fixtures in this repository rather than a
 * customer's key.
 *
 * Only the SHA-256 is stored. There is no salt and no KDF on purpose: the key
 * is 192 bits of `randomBytes`, not a password, so there is nothing to slow
 * down — and a lookup has to be a single indexed comparison, not a scan.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const API_KEY_PREFIX = 'rp_';

/** A fresh key. Shown to the operator once; never recoverable afterwards. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** The public handle. Safe to log; not a credential. */
export function newApiKeyId(): string {
  return `key_${randomUUID()}`;
}

/**
 * Read a key out of the request headers.
 *
 * `Authorization: Bearer …` is the standard; `X-API-Key` is what most agent
 * tooling sends. Both are accepted, the standard one wins when both are
 * present, and anything that is not a `Bearer` scheme is ignored rather than
 * rejected — a client sending `Authorization: Basic …` for an unrelated proxy
 * should not turn into a 401 here.
 */
export function readApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'];
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1].trim();
  }
  const direct = headers['x-api-key'];
  if (typeof direct === 'string' && direct.trim() !== '') return direct.trim();
  if (Array.isArray(direct) && typeof direct[0] === 'string' && direct[0].trim() !== '') {
    return direct[0].trim();
  }
  return null;
}
