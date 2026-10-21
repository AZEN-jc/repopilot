/**
 * Server-side environment loader. Reads process.env (or a .env file in dev)
 * and returns a typed, validated config object.
 *
 * If you add a new env variable, declare it here AND in `.env.example`.
 */
import { z } from 'zod';
import { SUPPORTED_NETWORKS } from '@repopilot/okx-adapter';

/**
 * The environment schema, exported so its rejections can be tested without
 * `process.env`.
 *
 * `loadConfig()` reads the process environment and caches the result, which
 * makes it awkward to drive from a test and easy to leave a polluted
 * environment behind. The schema is a pure function of an object; testing it
 * directly is the same assertion without either problem.
 */
export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),

  DATABASE_URL: z.string().default('file:./data/repopilot.db'),

  GITHUB_TOKEN: z.string().optional(),

  ALLOWED_REPO_HOSTS: z
    .string()
    .default('github.com,raw.githubusercontent.com')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),

  MAX_FILES: z.coerce.number().int().positive().default(2000),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(52_428_800),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),

  // Reverse proxies whose `X-Forwarded-For` this deployment believes.
  //
  // The header is client-writable, so reading it with no trusted proxy in
  // front is reading an assertion as a fact: `X-Forwarded-For: 127.0.0.1`
  // would put the caller inside the rate-limit allow-list, and a fresh random
  // value per request would reset the bucket every time. Loopback only by
  // default, which is what `verify:release` and the tests run against. A
  // deployment behind nginx or Caddy MUST name that proxy's address here, or
  // every client behind it shares one bucket.
  TRUSTED_PROXY_IPS: z
    .string()
    .default('127.0.0.1,::1,::ffff:127.0.0.1')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),

  PAYMENT_MODE: z.enum(['mock', 'okx']).default('mock'),
  OKX_PAYMENT_ADDRESS: z.string().default(''),
  // A closed set, not a free string (R-67). Each name is a USDT contract, a
  // decimals value and a chain id in `USDT_BY_NETWORK`; the adapter used to
  // fall back to xlayer's for anything it did not recognise, which produced a
  // challenge naming a chain that does not exist while quoting a real token.
  // `z.enum` here means a typo fails at startup, with the variable named and
  // the alternatives listed, instead of at the buyer's wallet.
  OKX_PAYMENT_NETWORK: z.enum(SUPPORTED_NETWORKS).default('xlayer'),
  OKX_X402_VERSION: z.coerce.number().int().default(2),
  // The URL this deployment is reachable at, placed in the 402 challenge's
  // `accepts[].resource`. Empty in dev; production requires it (see
  // `validateProductionConfig`) because a buyer's client reads this field to
  // know what it is paying for.
  OKX_PAYMENT_RESOURCE_URL: z.string().default(''),

  // One price for the audit, in USDT. It used to be one per `mode`
  // (PRICE_QUICK_SCAN / PRICE_FULL_AUDIT); both modes run the same analysis, so
  // the difference priced report sections rather than work. See
  // `DEFAULT_PRICING` in `@repopilot/core`.
  //
  // The shape is validated here, not downstream: the value is converted to
  // atomic units for an EIP-3009 authorization, and `'abc'` used to become
  // `'abc000000'` in the challenge — a number a buyer's client would sign.
  // `'0'` is refused too: it is a well-formed price that makes every audit
  // free, which is a deployment mistake far more often than an intent.
  PRICE_AUDIT: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'PRICE_AUDIT must be a positive decimal with at most 6 places')
    .refine((v) => Number(v) > 0, 'PRICE_AUDIT must be greater than zero')
    .default('1'),

  // `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` were declared
  // here and read by nothing but `defaultLlmProvider()`, which fed an unused
  // `AppDeps.llmProvider`. Removed in R-38.

  // Report cache (paid audits only). Default off so existing
  // snapshots stay stable; turn on in production.
  REPORT_CACHE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REPORT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Audit queue driver: "inline" runs in-process; "pg-boss" persists to
  // PostgreSQL. Local dev + tests default to inline. Production MUST be
  // pg-boss (or a future persistent driver) — see config invariants below.
  AUDIT_QUEUE_DRIVER: z.enum(['inline', 'pg-boss']).default('inline'),
  AUDIT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AUDIT_QUEUE_RETRY_LIMIT: z.coerce.number().int().min(0).max(5).default(1),
  AUDIT_QUEUE_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),

  // Graceful shutdown window: how long the server waits for in-flight
  // jobs to drain before forcing the queue / DB to close.
  SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().positive().default(30_000),
});

// ----------------------------------------------------------------------------
// Production guards (R-02).
//
// `env:check` and the config schema alone are not enough: they let a
// misconfigured server boot, log a warning, and accept payment in mock mode.
// We add a single, hard fail-point in `validateProductionConfig()` below
// and call it from `loadConfig()` so any process that reads the config
// (API server, scripts, workers) gets the same protection.
//
// Invariants:
//   - production + PAYMENT_MODE=mock            => fail
//   - production + PAYMENT_MODE=okx + empty addr => fail
//   - production + PAYMENT_MODE=okx + no resource URL => fail
//   - production + AUDIT_QUEUE_DRIVER=inline    => fail
//
// All error messages are scrubbed of any secret value (we only print the
// names of the offending fields, never the values).
// ----------------------------------------------------------------------------
export class ProductionConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      `Refusing to start with an unsafe production configuration: ${issues.join('; ')}`,
    );
    this.name = 'ProductionConfigError';
    this.issues = issues;
  }
}

/**
 * A resource URL is usable in a 402 challenge when it is https, has a host with
 * a dot in it, and is not one of the reserved names that can never resolve.
 *
 * The `.invalid` case is the one that matters: the adapter's own placeholder
 * uses it, so without this check an operator who sets the placeholder by hand
 * would pass.
 */
export function isPublicHttpsUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s.startsWith('https://')) return false;
  let host: string;
  try {
    host = new URL(s).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host.includes('.')) return false;
  if (host.endsWith('.invalid') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return true;
}

export function validateProductionConfig(cfg: AppConfig): void {
  if (cfg.NODE_ENV !== 'production') return;
  const issues: string[] = [];
  if (cfg.PAYMENT_MODE === 'mock') {
    issues.push(
      'NODE_ENV=production with PAYMENT_MODE=mock is forbidden (R-02). Set PAYMENT_MODE=okx with a valid OKX_PAYMENT_ADDRESS.',
    );
  }
  if (cfg.PAYMENT_MODE === 'okx' && cfg.OKX_PAYMENT_ADDRESS.trim() === '') {
    issues.push(
      'NODE_ENV=production with PAYMENT_MODE=okx requires OKX_PAYMENT_ADDRESS to be set.',
    );
  }
  if (cfg.PAYMENT_MODE === 'okx' && !isPublicHttpsUrl(cfg.OKX_PAYMENT_RESOURCE_URL)) {
    issues.push(
      'NODE_ENV=production with PAYMENT_MODE=okx requires OKX_PAYMENT_RESOURCE_URL to be this ' +
        'deployment\'s own public https URL (for example https://api.example.com/api/v1/audits). ' +
        'It is what the 402 challenge shows the buyer as the thing being paid for; the ' +
        'unconfigured value is a reserved .invalid host that can never resolve.',
    );
  }
  if (cfg.AUDIT_QUEUE_DRIVER === 'inline') {
    issues.push(
      'NODE_ENV=production with AUDIT_QUEUE_DRIVER=inline is forbidden. Use AUDIT_QUEUE_DRIVER=pg-boss with a persistent PostgreSQL store.',
    );
  }
  if (issues.length > 0) throw new ProductionConfigError(issues);
}

export type AppConfig = z.infer<typeof ConfigSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid configuration:', parsed.error.format());
    throw new Error('Invalid configuration');
  }
  cached = parsed.data;
  validateProductionConfig(cached);
  return cached;
}

export function _resetConfigCacheForTests(): void {
  cached = null;
}
