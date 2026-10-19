import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../server.js';
import type { AuditPipeline, MetadataAnalyzer, Report } from '@repopilot/core';

/**
 * The paid endpoint in `PAYMENT_MODE=okx`.
 *
 * Every other payment test in this repository runs in mock mode, where the
 * `X-PAYMENT` header is the plain string `mock:<id>` and nothing has to be
 * decoded. That is why a defect survived in the OKX path for as long as it did:
 * the route carried its own second parser for the header, it looked for
 * `paymentId` at the top level of the envelope, while the adapter's
 * `ParsedPaymentHeader` declares it under `payload` — so a buyer following the
 * documented flow was answered `400 X-PAYMENT header is malformed` and the
 * adapter was never consulted. The rail could not accept a payment at all.
 *
 * These tests do not need a valid signature to catch that: the question is
 * whether a **well-formed** envelope reaches the adapter. A `402
 * PAYMENT_NOT_SETTLED` means it did (the signature was checked and rejected); a
 * `400` means the header never got that far.
 *
 * A genuinely signed envelope is covered in
 * `packages/okx-adapter/src/okx-adapter.test.ts`, which has `viem` to sign with.
 * Signing here would mean adding `viem` to this package for one test.
 *
 * That is also why there is no route-level replay test (R-40). "One payment,
 * one audit" needs an authorization that *does* verify — an unsigned envelope
 * is rejected at the signature, before the nonce is consulted, so a route test
 * built on one would pass whether or not the guard exists. The property is
 * pinned one layer down instead, and the link between the two layers is pinned
 * here: `does not enqueue the audit when the payment is not completed` is the
 * route half of `receipt.status !== 'completed'` → 402, and the adapter half is
 * `refuses a signature that has already bought an audit` → `failed`.
 */

const RECIPIENT = '0x1234567890123456789012345678901234567890';

/** The pipeline is never reached in these tests — payment always fails first. */
class UnreachablePipeline {
  async run(): Promise<never> {
    throw new Error('the pipeline must not run without a completed payment');
  }
}

class FakeMetadataAnalyzer {
  async getDefaultBranch(): Promise<string | null> {
    return 'main';
  }
  async getHeadSha(): Promise<string | null> {
    return 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  }
  async fetch(): Promise<never> {
    throw new Error('unused');
  }
}

/** A well-formed envelope with a signature that cannot verify. */
function unsignedEnvelope(paymentId: string, where: 'payload' | 'top' = 'payload'): string {
  const authorization = {
    from: RECIPIENT,
    to: RECIPIENT,
    value: '1000000',
    validAfter: '0',
    validBefore: '9999999999',
    nonce: `0x${'00'.repeat(32)}`,
  };
  const envelope =
    where === 'payload'
      ? { x402Version: 2, signature: '0xab', payload: { paymentId, authorization } }
      : { x402Version: 2, signature: '0xab', paymentId, payload: { authorization } };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

const AUDIT_BODY = {
  repoUrl: 'https://github.com/okx/repopilot',
  mode: 'full',
  target: 'production',
  outputLanguage: 'en',
  includeLaunchCopy: true,
};

describe('PAYMENT_MODE=okx — the paid endpoint can be reached', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const deps: AppDeps = {
      payment: {
        mode: 'okx',
        okx: { recipientAddress: RECIPIENT, network: 'xlayer', x402Version: 2 },
        pricing: { audit: { amount: '1', currency: 'USDT' } },
      },
      allowedHosts: ['github.com', 'raw.githubusercontent.com'],
      pipeline: new UnreachablePipeline() as unknown as AuditPipeline,
      metadataAnalyzer: new FakeMetadataAnalyzer() as unknown as MetadataAnalyzer,
      databaseUrl: 'file:./data/test-okx-payment.db',
    };
    app = await buildApp(deps);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function challenge(): Promise<{ jobId: string; paymentId: string }> {
    const res = await app.inject({ method: 'POST', url: '/api/v1/audits', payload: AUDIT_BODY });
    expect(res.statusCode).toBe(402);
    const body = res.json() as { jobId: string; payment: { paymentId: string; mode: string } };
    expect(body.payment.mode).toBe('okx');
    expect(body.payment.paymentId).toMatch(/^okx_/);
    return { jobId: body.jobId, paymentId: body.payment.paymentId };
  }

  it('reads the paymentId from payload and answers 402, not 400', async () => {
    const { paymentId } = await challenge();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': unsignedEnvelope(paymentId, 'payload') },
      payload: AUDIT_BODY,
    });
    // 402 = the envelope was parsed, the id was found, the signature was
    // checked and rejected. 400 would mean it was never parsed.
    expect(res.statusCode).toBe(402);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('PAYMENT_NOT_SETTLED');
  });

  it('reads the paymentId from the top level too', async () => {
    // The wire shape is not documented in this repository, so the adapter reads
    // both placements. This pins the second one through the whole route.
    const { paymentId } = await challenge();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': unsignedEnvelope(paymentId, 'top') },
      payload: AUDIT_BODY,
    });
    expect(res.statusCode).toBe(402);
    expect((res.json() as { error: { code: string } }).error.code).toBe('PAYMENT_NOT_SETTLED');
  });

  it('still answers 400 for a header it cannot read at all', async () => {
    // The error path has to survive the fix: "unreadable" and "unverified" are
    // different answers and a caller can act on the difference.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': 'not-base64-!!' },
      payload: AUDIT_BODY,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
  });

  it('does not enqueue the audit when the payment is not completed', async () => {
    const { paymentId } = await challenge();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': unsignedEnvelope(paymentId) },
      payload: AUDIT_BODY,
    });
    expect(res.statusCode).toBe(402);
    // `UnreachablePipeline` throws if it is ever called, so reaching here at all
    // is the assertion that no audit ran for an unverified payment.
  });
});

/**
 * The completed-job short-circuit, attacked with the rail that can tell.
 *
 * The branch in `audits.ts` that re-serves a completed report used to gate on
 * `readPaymentId(xPayment) === job.paymentId`. `readPaymentId` *parses* a
 * header; it checks no signature, no `from`, no amount, no time window and no
 * nonce. `job.paymentId` is also the value the 402 body discloses. So the gate
 * reduced to "the caller knows a string this service handed out" — an envelope
 * carrying `signature: "0x00"` and the right `payload.paymentId` returned a
 * paid report for nothing. R-46 closed the no-header case; this is the
 * forged-header case beside it.
 *
 * Mock mode cannot catch it: `MockPaymentAdapter.verifyPayment` treats *any*
 * non-empty header as proof, deliberately. So the completed row is produced
 * under a mock app sharing one database with the okx app that attacks it —
 * two apps, one row, and only the attacker's rail actually verifies.
 */
describe('a completed report is not re-served on a forged X-PAYMENT', () => {
  const REPO_URL = 'https://github.com/okx/repopilot';
  const BODY = { repoUrl: REPO_URL, mode: 'quick', target: 'open_source', outputLanguage: 'en' };

  /** A report the real `ReportSchema.parse` accepts — the route parses it. */
  function validReport(): Report {
    return {
      reportVersion: '1.0',
      repository: {
        url: REPO_URL,
        owner: 'okx',
        name: 'repopilot',
        defaultBranch: 'main',
        license: 'MIT',
        lastUpdatedAt: '2026-01-01T00:00:00Z',
        visibility: 'public',
        archived: false,
        stars: 0,
        openIssues: 0,
        openPulls: 0,
        description: 'Test',
        primaryLanguage: 'TypeScript',
      },
      summary: 'OK',
      detectedStack: [],
      scores: { overall: 90, documentation: 95, reproducibility: 90, securityHygiene: 100, deploymentReadiness: 85, breakdown: {} },
      blockers: [],
      documentationGaps: [],
      securityFindings: [],
      qualityFindings: [],
      fixtureFindings: [],
      reproducibilityFindings: [],
      deploymentFindings: [],
      fixtureSummary: [],
      deploymentPlan: [],
      recommendedTasks: [],
      launchChecklist: [],
      omittedSections: ['deploymentPlan', 'launchCopy'],
      launchCopy: { oneSentencePitch: '', shortDescription: '', xPost: '' },
      limitations: [],
      generatedAt: new Date().toISOString(),
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      analyzerProvenance: {},
    } as unknown as Report;
  }

  class SucceedingPipeline {
    runs = 0;
    async run(): Promise<{ report: Report; truncated: boolean }> {
      this.runs += 1;
      return { report: validReport(), truncated: false };
    }
  }

  /** Resolves the head SHA without reaching GitHub. */
  class FakeMetadata {
    async getDefaultBranch(): Promise<string> {
      return 'main';
    }
    async getHeadSha(): Promise<string> {
      return 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    }
    async fetch(): Promise<never> {
      throw new Error('unused');
    }
  }

  it('answers 402, not 200, when the header names the payment but proves nothing', async () => {
    const db = `file:./data/test-completed-gate-${Date.now()}.db`;
    const base = {
      allowedHosts: ['github.com'],
      pipeline: new SucceedingPipeline() as unknown as AuditPipeline,
      metadataAnalyzer: new FakeMetadata() as unknown as MetadataAnalyzer,
      databaseUrl: db,
      pricing: { audit: { amount: '1', currency: 'USDT' as const } },
    };

    // Step 1 — quote. The 402 body discloses the paymentId, which is exactly
    // what the forged header will name later.
    const quote = await buildApp({
      ...base,
      payment: {
        mode: 'mock',
        okx: { recipientAddress: RECIPIENT, network: 'xlayer', x402Version: 2 },
        pricing: base.pricing,
      },
    });
    const quoteRes = await quote.inject({ method: 'POST', url: '/api/v1/audits', payload: BODY });
    expect(quoteRes.statusCode).toBe(402);
    const { jobId, payment } = quoteRes.json() as { jobId: string; payment: { paymentId: string } };
    await quote.close();

    // Step 2 — pay it under the mock rail (`mock:<id>` is proof there) and let
    // the inline worker run the pipeline, so the row reaches `completed` with a
    // report attached. A second app on the same database finds the row by the
    // header's paymentId, so the quote and the pay are two requests.
    const payer = await buildApp({
      ...base,
      payment: {
        mode: 'mock',
        okx: { recipientAddress: RECIPIENT, network: 'xlayer', x402Version: 2 },
        pricing: base.pricing,
      },
    });
    const paid = await payer.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': `mock:${payment.paymentId}` },
      payload: BODY,
    });
    expect(paid.statusCode).toBe(202);
    let completed = false;
    for (let i = 0; i < 50; i += 1) {
      const poll = await payer.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
      if (poll.statusCode === 200 && (poll.json() as { status: string }).status === 'completed') {
        completed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await payer.close();
    expect(completed).toBe(true);

    // Step 3 — attack the completed row through the rail that verifies. The
    // envelope is well-formed and names the right payment; it cannot verify.
    const attacker = await buildApp({
      ...base,
      pipeline: new UnreachablePipeline() as unknown as AuditPipeline,
      payment: { mode: 'okx', okx: { recipientAddress: RECIPIENT, network: 'xlayer', x402Version: 2 }, pricing: base.pricing },
    });
    try {
      const res = await attacker.inject({
        method: 'POST',
        url: '/api/v1/audits',
        headers: { 'x-payment': unsignedEnvelope(payment.paymentId, 'payload') },
        payload: BODY,
      });
      // 402, and specifically the *re-quote* shape: a fresh challenge naming
      // a different payment. That is the honest answer — "you have not paid
      // for this, here is how" — and it is also the proof that the branch did
      // not fall through to the report. `200 + report` is the regression.
      expect(res.statusCode).toBe(402);
      const body = res.json() as {
        jobId: string;
        status: string;
        payment: { paymentId: string; mode: string };
      };
      expect(body.jobId).toBe(jobId);
      expect(body.status).toBe('completed');
      expect(body.payment.mode).toBe('okx');
      expect(body.payment.paymentId).not.toBe(payment.paymentId);
    } finally {
      await attacker.close();
    }
  });
});
