import { describe, expect, it } from 'vitest';
import { paymentFromEnv, PaymentEnvError } from './payment-env.js';

/**
 * The MCP binary reads five environment variables and, before this, guessed
 * at three of them: `PAYMENT_MODE === 'okx' ? 'okx' : 'mock'` turned every
 * misspelling into a free-audit server, and `PRICE_AUDIT` went to `toAtomic`
 * unvalidated, so `abc` became `abc000000` in a challenge a buyer would sign.
 *
 * These cases pin the refusals. Each one is a value a real operator types.
 */
function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe('paymentFromEnv', () => {
  it('defaults to the mock rail outside production', () => {
    const cfg = paymentFromEnv(env());
    expect(cfg.mode).toBe('mock');
    expect(cfg.pricing.audit).toEqual({ amount: '1', currency: 'USDT' });
  });

  it('accepts the two mode names it documents', () => {
    expect(paymentFromEnv(env({ PAYMENT_MODE: 'mock' })).mode).toBe('mock');
    expect(
      paymentFromEnv(env({ PAYMENT_MODE: 'okx', OKX_PAYMENT_ADDRESS: '0xabc' })).mode
    ).toBe('okx');
  });

  it('refuses a mode it does not recognise instead of falling back to mock', () => {
    // `'Okx'` is the realistic one: environment files are edited by hand and
    // the fallback used to be silent.
    for (const bad of ['Okx', 'OKX', 'ok', 'moc', 'production']) {
      expect(() => paymentFromEnv(env({ PAYMENT_MODE: bad }))).toThrow(PaymentEnvError);
    }
  });

  it('refuses the mock rail when NODE_ENV says production', () => {
    expect(() => paymentFromEnv(env({ NODE_ENV: 'production' }))).toThrow(
      /PAYMENT_MODE=mock is refused/
    );
    // The same environment with the real rail starts.
    expect(
      paymentFromEnv(
        env({ NODE_ENV: 'production', PAYMENT_MODE: 'okx', OKX_PAYMENT_ADDRESS: '0xabc' })
      ).mode
    ).toBe('okx');
  });

  it('refuses okx mode with nowhere to send the payment', () => {
    expect(() => paymentFromEnv(env({ PAYMENT_MODE: 'okx' }))).toThrow(
      /requires OKX_PAYMENT_ADDRESS/
    );
  });

  it('refuses a price that is not a positive decimal', () => {
    for (const bad of ['abc', '0', '-1', '1.1234567', '', '1,5', '1e3']) {
      expect(() => paymentFromEnv(env({ PRICE_AUDIT: bad }))).toThrow(PaymentEnvError);
    }
  });

  it('keeps a valid price verbatim — it is signed by the buyer', () => {
    // Not normalised on purpose: the number in the challenge has to be the
    // number the operator configured, so a buyer and the listing agree.
    expect(paymentFromEnv(env({ PRICE_AUDIT: '0.05' })).pricing.audit.amount).toBe('0.05');
    expect(paymentFromEnv(env({ PRICE_AUDIT: '1' })).pricing.audit.amount).toBe('1');
  });

  it('reads the network and x402 version, defaulting both', () => {
    const cfg = paymentFromEnv(env({ PAYMENT_MODE: 'okx', OKX_PAYMENT_ADDRESS: '0xabc' }));
    expect(cfg.okx?.network).toBe('xlayer');
    expect(cfg.okx?.x402Version).toBe(2);
    const v1 = paymentFromEnv(
      env({ PAYMENT_MODE: 'okx', OKX_PAYMENT_ADDRESS: '0xabc', OKX_X402_VERSION: '1' })
    );
    expect(v1.okx?.x402Version).toBe(1);
  });
});
