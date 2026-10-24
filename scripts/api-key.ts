#!/usr/bin/env tsx
/**
 * api-key — issue, revoke and list API keys.
 *
 *   pnpm api-key create --label "ci" [--limit 120]
 *   pnpm api-key revoke <keyId>
 *   pnpm api-key list
 *
 * Issuance is an operator action against the database, not an HTTP endpoint:
 * there is no account system to hang a self-service flow on, and an endpoint
 * that mints credentials would need an admin credential to protect it — which
 * is the thing this command is for.
 *
 * The plaintext key is printed once and never stored. Only its SHA-256 goes
 * into the row, so this command's output is the only copy.
 *
 * `DATABASE_URL` is read directly rather than through `loadConfig()`: issuing
 * a key should not require the payment configuration a server needs, and
 * `loadConfig()` refuses to load an unsafe production config — an operator
 * locked out of their own key management by a payment setting would be a
 * worse failure than the one that guard prevents.
 */
import { closeDatabase, openDatabase, runMigrations } from '../apps/api/src/db/client.js';
import { ApiKeyRepository } from '../apps/api/src/repositories/api-key-repository.js';
import { generateApiKey, hashApiKey } from '../apps/api/src/utils/api-key.js';

function usage(): void {
  console.error(`usage:
  api-key create --label <label> [--limit <perMinute>]
  api-key revoke <keyId>
  api-key list`);
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    usage();
    return 2;
  }

  const db = openDatabase(process.env['DATABASE_URL'] ?? 'file:./data/repopilot.db');
  await runMigrations(db);
  const repo = new ApiKeyRepository(db);

  try {
    if (command === 'create') {
      const label = flag(args, '--label');
      if (!label) {
        console.error('create needs --label, so a key can be attributed later.');
        return 2;
      }
      const limitRaw = flag(args, '--limit');
      let limit: number | null = null;
      if (limitRaw !== undefined) {
        limit = Number(limitRaw);
        if (!Number.isInteger(limit) || limit <= 0) {
          console.error(`--limit must be a positive integer; got ${limitRaw}`);
          return 2;
        }
      }

      const key = generateApiKey();
      const record = await repo.create({
        keyHash: hashApiKey(key),
        label,
        rateLimitPerMinute: limit,
      });
      console.log(`created ${record.keyId}  label="${record.label}"  limit=${limit ?? 'default'}`);
      console.log('');
      console.log(`  ${key}`);
      console.log('');
      console.log('This is the only time the key is shown. Store it where the caller can read it.');
      return 0;
    }

    if (command === 'revoke') {
      const keyId = args[0];
      if (!keyId) {
        usage();
        return 2;
      }
      const revoked = await repo.revoke(keyId);
      if (!revoked) {
        console.error(`no active key with id ${keyId}`);
        return 1;
      }
      console.log(`revoked ${keyId}`);
      return 0;
    }

    if (command === 'list') {
      const rows = await repo.list();
      if (rows.length === 0) {
        console.log('no keys issued');
        return 0;
      }
      const header = ['KEY ID', 'LABEL', 'LIMIT', 'CREATED', 'STATUS'];
      console.log(header.join('\t'));
      for (const row of rows) {
        console.log(
          [
            row.keyId,
            row.label,
            row.rateLimitPerMinute ?? 'default',
            row.createdAt,
            row.revokedAt ? `revoked ${row.revokedAt}` : 'active',
          ].join('\t'),
        );
      }
      return 0;
    }

    usage();
    return 2;
  } finally {
    await closeDatabase();
  }
}

async function run(): Promise<void> {
  try {
    process.exitCode = await main();
  } catch (err) {
    console.error('api-key failed:', (err as Error)?.message ?? err);
    process.exitCode = 1;
  }
}

void run();
