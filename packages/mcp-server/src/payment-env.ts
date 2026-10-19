/**
 * Payment configuration read from the environment, with the guesses removed.
 *
 * Split out of `cli.ts` so it can be tested without starting a server: the
 * CLI's whole job is to read `process.env` once and hand the result to
 * `startStdioServer`, which means importing it in a test would run the
 * server. This module is a pure function of an environment object.
 *
 * The rules it enforces are the ones the API already enforces in
 * `validateProductionConfig` (R-02). The binary is the marketplace listing's
 * own entrypoint, so a deployment that sets `PAYMENT_MODE` to a misspelling
 * gets the same answer here as it would from the API: refuse to start.
 */
import { DEFAULT_PRICING } from '@repopilot/core';
import type { PaymentConfig } from '@repopilot/okx-adapter';

export class PaymentEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentEnvError';
  }
}

const PRICE = /^\d+(\.\d{1,6})?$/;

export function paymentFromEnv(env: NodeJS.ProcessEnv): PaymentConfig {
  const rawMode = env['PAYMENT_MODE'];
  if (rawMode !== undefined && rawMode !== '' && rawMode !== 'mock' && rawMode !== 'okx') {
    throw new PaymentEnvError(`PAYMENT_MODE must be "mock" or "okx" (got "${rawMode}")`);
  }
  const mode: 'mock' | 'okx' = rawMode === 'okx' ? 'okx' : 'mock';

  // A production process must not run the mock rail: it treats any non-empty
  // `X-PAYMENT` as proof of payment, so a deployment that meant to charge
  // would hand out audits for free — with no log line and no failed request.
  if (env['NODE_ENV'] === 'production' && mode !== 'okx') {
    throw new PaymentEnvError(
      'PAYMENT_MODE=mock is refused with NODE_ENV=production — set PAYMENT_MODE=okx ' +
        'and OKX_PAYMENT_ADDRESS, or unset NODE_ENV for a local run'
    );
  }

  const recipientAddress = env['OKX_PAYMENT_ADDRESS'] ?? '';
  if (mode === 'okx' && !recipientAddress) {
    throw new PaymentEnvError(
      'PAYMENT_MODE=okx requires OKX_PAYMENT_ADDRESS — there is nowhere to send the payment'
    );
  }

  // `PRICE_AUDIT=abc` used to reach `toAtomic` and come out as `abc000000`,
  // which is then signed by the buyer. Validate it where it enters.
  const amount = env['PRICE_AUDIT'] ?? DEFAULT_PRICING.audit.amount;
  if (!PRICE.test(amount) || Number(amount) <= 0) {
    throw new PaymentEnvError(
      `PRICE_AUDIT must be a positive decimal with at most 6 places (got "${amount}"); ` +
        'it is converted to atomic units and signed by the buyer'
    );
  }

  return {
    mode,
    okx: {
      recipientAddress,
      network: env['OKX_PAYMENT_NETWORK'] ?? 'xlayer',
      x402Version: (Number(env['OKX_X402_VERSION']) === 1 ? 1 : 2) as 1 | 2,
    },
    pricing: { audit: { amount, currency: 'USDT' } },
  };
}
