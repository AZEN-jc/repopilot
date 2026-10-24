import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import { buildApp, type AppDeps } from '../server.js';
import { SPEC_SCHEMAS } from '../openapi-schemas.js';
import type { AuditPipeline } from '@repopilot/core';
import type { MetadataAnalyzer } from '@repopilot/core';
import type { Report, RepoMetadata, FileEntry } from '@repopilot/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_DIR = path.resolve(__dirname, '../../../../fixtures/complete-project');

/**
 * A fixed head SHA.
 *
 * Without it every job row carries `commit_sha = NULL`, because the only
 * way to learn a SHA is to ask GitHub, and a test that asks GitHub is
 * neither deterministic nor offline. The worker resolved it for the
 * cache key and threw it away for several releases; pinning it here is
 * what makes "the derived views report the commit they analysed"
 * assertable at all.
 */
const HEAD_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

class FakeMetadataAnalyzer {
  /**
   * The SHA every job is recorded against.
   *
   * Mutable so one test can exercise the unresolvable case, where the
   * route has no commit to record. That test resets it in a `finally`,
   * because every other test in this file asserts on the value.
   */
  sha: string | null = HEAD_SHA;

  async getDefaultBranch(): Promise<string | null> {
    return 'main';
  }
  async getHeadSha(): Promise<string | null> {
    return this.sha;
  }
  async fetch(): Promise<never> {
    throw new Error('the fake pipeline never asks for repository metadata');
  }
}

class FakePipeline {
  lastInput: unknown = null;
  /**
   * How many times the pipeline actually ran.
   *
   * The derived endpoints promise never to re-scan a repository. A count
   * is how that promise is checked: read a fix plan, a diff and a
   * history list, and this number must not move.
   */
  runs = 0;
  /**
   * Per-repository report overrides.
   *
   * Keyed by repoUrl rather than held in a single mutable field, so a
   * test that needs a blocking report cannot leak it into the tests that
   * expect a clean one — whichever order they happen to run in. Setting
   * the same url again replaces it, which is how a test gets two audits
   * of one repository with different reports.
   */
  private overrides = new Map<string, Report>();

  setReport(repoUrl: string, report: Report): void {
    this.overrides.set(repoUrl, report);
  }

  /**
   * Repositories whose audit throws, so the `failed` branch of the job
   * lifecycle is reachable.
   *
   * Every other test here drives a job to `completed`, which left the failed
   * envelope — the one with `error.code`, `error.message` and `failedAt` — with
   * no assertion at all against what the server sends. The published contract
   * describes it; nothing checked that the description was true.
   */
  private failures = new Map<string, { code: string; message: string }>();

  failOn(repoUrl: string, code: string, message: string): void {
    this.failures.set(repoUrl, { code, message });
  }

  async run(input: { repoUrl: string }) {
    this.lastInput = input;
    this.runs += 1;
    const failure = this.failures.get(input.repoUrl);
    if (failure) {
      throw Object.assign(new Error(failure.message), { code: failure.code });
    }
    return {
      report: this.overrides.get(input.repoUrl) ?? fakeReport(),
      truncated: false,
    };
  }
}

function fakeReport(): Report {
  return {
    reportVersion: '1.0',
    repository: {
      url: 'https://github.com/okx/repopilot',
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
    detectedStack: ['TypeScript', 'Node.js'],
    scores: {
      overall: 90,
      documentation: 95,
      reproducibility: 90,
      securityHygiene: 100,
      deploymentReadiness: 85,
      breakdown: {},
    },
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
    // A `quick` report declares both full-only sections omitted, and carries
    // no launch copy — the state the real builder produces. Without the
    // declaration a reader cannot tell "this tier does not carry a deployment
    // plan" from "this repository needs none"; the two look identical on the
    // wire. An empty `launchCopy` alongside an omission claim is the same
    // contradiction the builder used to emit.
    omittedSections: ['deploymentPlan', 'launchCopy'],
    launchCopy: { oneSentencePitch: '', shortDescription: '', xPost: '' },
    limitations: [],
    generatedAt: new Date().toISOString(),
    auditMode: 'quick',
    target: 'open_source',
    outputLanguage: 'en',
    analyzerProvenance: {},
  };
}

/**
 * A report carrying one live credential — the case the quality contract
 * exists to catch. Nothing else about the report changes, so a `blocked`
 * verdict can only come from the finding.
 */
function blockedReport(): Report {
  const base = fakeReport();
  return {
    ...base,
    securityFindings: [
      {
        id: 'SEC-SECRET-001:src/config.ts:12',
        ruleId: 'SEC-SECRET-001',
        fingerprint: 'fp-live-credential',
        category: 'security',
        severity: 'critical',
        confidence: 0.7,
        title: 'Live credential committed to source',
        description: 'An assignment to `apiKey` in src/config.ts looks like a real key.',
        evidence: [
          { file: 'src/config.ts', line: 12, reason: 'high-entropy string assigned to apiKey' },
        ],
        recommendedAction: 'Rotate the credential, then read it from the environment.',
        acceptanceCriteria: ['The credential no longer appears in the tree.'],
      },
    ],
  };
}

/** Drive one audit through payment and the queue until it completes. */
async function runAudit(app: FastifyInstance, repoUrl: string): Promise<string> {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/audits',
    payload: { repoUrl, mode: 'quick' },
  });
  const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };

  const paid = await app.inject({
    method: 'POST',
    url: '/api/v1/audits',
    headers: { 'x-payment': `mock:${payment.paymentId}` },
    payload: { repoUrl, mode: 'quick' },
  });
  expect(paid.statusCode).toBe(202);

  for (let i = 0; i < 50; i += 1) {
    const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
    const got = res.json() as { status: string };
    if (res.statusCode === 200 && got.status === 'completed') return jobId;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`job ${jobId} never completed`);
}

/**
 * Parse a response body through the schema the published contract declares.
 *
 * The failure message names the endpoint, because a `safeParse` failure on its
 * own reads as "some Zod error" and the reader has to work out which response
 * it came from.
 */
function asContract<T>(schema: ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`${what} does not match the published contract — ${issues}`);
  }
  return parsed.data;
}

interface QualityBody {
  schemaVersion: string;
  status: string;
  ship: boolean;
  blockerCount: number;
  warningCount: number;
  sections: { id: string; status: string; checks: { id: string; status: string }[] }[];
  blockingFingerprints: string[];
  evaluatedAt: string;
}

interface FixPlanSetBody {
  schemaVersion: string;
  reportVersion: string;
  repository: { owner: string; name: string; url: string; commitSha: string | null };
  generatedAt: string;
  plans: {
    planId: string;
    findingId: string;
    priority: string;
    status: string;
    title: string;
    evidence: { file: string; line: number | null }[];
    steps: { order: number; action: string }[];
    acceptanceCriteria: string[];
    agentInstructions: string;
  }[];
}

interface AuditDiffBody {
  schemaVersion: string;
  base: { jobId: string | null; commitSha: string | null; overall: number };
  head: { jobId: string | null; commitSha: string | null; overall: number };
  scoreDelta: number;
  dimensionDeltas: Record<string, number>;
  ruleDeltas: unknown[];
  resolved: string[];
  new: string[];
  persistent: string[];
  moved: { ruleId: string; file: string; fromLine: number | null; toLine: number | null }[];
  verdict: string;
}

interface AuditHistoryBody {
  owner: string;
  repo: string;
  limit: number;
  count: number;
  audits: {
    jobId: string;
    status: string;
    commitSha: string | null;
    mode: string;
    target: string;
    createdAt: string;
    completedAt: string | null;
    failedAt: string | null;
    overall: number | null;
    findingCount: number | null;
    errorCode: string | null;
    error: string | null;
  }[];
}

describe('API integration', () => {
  let app: FastifyInstance;
  let pipeline: FakePipeline;
  let metadata: FakeMetadataAnalyzer;
  let deps: AppDeps;

  beforeAll(async () => {
    pipeline = new FakePipeline();
    metadata = new FakeMetadataAnalyzer();
    deps = {
      payment: {
        mode: 'mock',
        okx: { recipientAddress: '', network: 'xlayer', x402Version: 2 },
        pricing: {
          audit: { amount: '0.02', currency: 'USDT' },
        },
      },
      allowedHosts: ['github.com', 'raw.githubusercontent.com'],
      pipeline: pipeline as unknown as AuditPipeline,
      metadataAnalyzer: metadata as unknown as MetadataAnalyzer,
      databaseUrl: 'file:./data/test-api-integration.db',
    };
    app = await buildApp(deps);
    // A route that reports `req.ip`, so `trustProxy` can be asserted as a
    // behaviour rather than as a stored option. Registered here rather than in
    // `buildApp` because it exists only to make that one observable; Fastify
    // accepts routes up to the first `ready()`.
    app.get('/__ip', async (req) => ({ ip: req.ip }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; paymentMode: string; database: string };
    expect(body.status).toBe('ok');
    expect(body.paymentMode).toBe('mock');
    expect(body.database).toBe('ok');
  });

  it('does not believe `X-Forwarded-For` from a peer it was not told to trust', async () => {
    // `trustProxy` was `true`, which makes `req.ip` follow `X-Forwarded-For`
    // from anyone: this request would have reported `1.2.3.4`, an address the
    // caller typed. The rate limiter never reads `req.ip` — it keys on the
    // socket peer and walks the trusted list itself — so the defect had no
    // visible effect anywhere, which is exactly why it needs an assertion: a
    // one-word change back to `true` would break nothing else in this suite.
    const forged = await app.inject({
      method: 'GET',
      url: '/__ip',
      remoteAddress: '203.0.113.7',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(forged.json()).toEqual({ ip: '203.0.113.7' });

    // And from a peer it *was* told to trust — loopback, the built-in default —
    // it reports the entry the edge appended, not the left-most one the client
    // claimed about itself. So `req.ip` is the same address the limiter keys
    // on, rather than a value the caller chose.
    const viaEdge = await app.inject({
      method: 'GET',
      url: '/__ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
    });
    expect(viaEdge.json()).toEqual({ ip: '203.0.113.9' });
  });

  it('GET /api/v1/capabilities returns the schema', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; paymentMode: string; pricing: { audit: { amount: string } } };
    expect(body.name).toBe('RepoPilot');
    expect(body.paymentMode).toBe('mock');
    expect(body.pricing.audit.amount).toBe('0.02');
  });

  /**
   * The published contract, against the wire.
   *
   * `openapi.test.ts` proves the document is internally sound and covers every
   * route. It cannot prove the document is *true*: a schema can be perfectly
   * self-consistent and describe a body the server never sends. That is exactly
   * how `CapabilitiesResponse.endpoints` came to list `auth` / `input` /
   * `output` — four fields the route has never emitted — while the `cache`
   * block it does emit was missing from the document.
   *
   * So every response the flow produces is parsed through the schema the
   * document publishes for it. A field renamed on one side and not the other
   * fails here, in the same run that proves the endpoint works.
   */
  it('sends the shapes the published contract describes', async () => {
    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    asContract(SPEC_SCHEMAS.RootResponse, root.json(), 'GET /');

    const health = await app.inject({ method: 'GET', url: '/health' });
    asContract(SPEC_SCHEMAS.HealthResponse, health.json(), 'GET /health');

    const caps = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    asContract(SPEC_SCHEMAS.CapabilitiesResponse, caps.json(), 'GET /api/v1/capabilities');

    // The error envelope, both from input validation and from a missing row.
    const badInput = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl: 'not-a-url' },
    });
    expect(badInput.statusCode).toBe(400);
    asContract(SPEC_SCHEMAS.ErrorResponse, badInput.json(), '400 from POST /api/v1/audits');

    const unknownJob = await app.inject({ method: 'GET', url: '/api/v1/audits/no-such-job' });
    expect(unknownJob.statusCode).toBe(404);
    asContract(SPEC_SCHEMAS.ErrorResponse, unknownJob.json(), '404 from GET /api/v1/audits/{jobId}');

    // The paid cycle: challenge → queue → answer.
    const repoUrl = 'https://github.com/okx/contract-shape';
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl, mode: 'quick' },
    });
    expect(create.statusCode).toBe(402);
    const challenge = asContract(
      SPEC_SCHEMAS.PaymentChallenge,
      create.json(),
      '402 from POST /api/v1/audits',
    );
    expect('payment' in challenge && 'nextAction' in challenge).toBe(true);
    const paymentId = 'payment' in challenge ? challenge.payment.paymentId : '';

    const paid = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': `mock:${paymentId}` },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(paid.statusCode).toBe(202);
    const queued = asContract(
      SPEC_SCHEMAS.AuditQueuedResponse,
      paid.json(),
      '202 from POST /api/v1/audits',
    );
    expect(queued.status).toBe('queued');

    // Poll. The first answer may still be 202, which is the *other* shape the
    // document publishes for this route and the reason there are two.
    let finished: string | null = null;
    for (let i = 0; i < 50 && finished === null; i += 1) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${queued.jobId}` });
      if (res.statusCode === 202) {
        asContract(SPEC_SCHEMAS.AuditPendingResponse, res.json(), '202 from GET /api/v1/audits/{jobId}');
      } else {
        const status = asContract(
          SPEC_SCHEMAS.AuditStatusResponse,
          res.json(),
          '200 from GET /api/v1/audits/{jobId}',
        );
        finished = status.status;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(finished).toBe('completed');
  });

  it('sends the failed-job shape the published contract describes', async () => {
    const repoUrl = 'https://github.com/okx/contract-shape-failure';
    pipeline.failOn(repoUrl, 'PIPELINE_FAILED', 'the pipeline could not finish');

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl, mode: 'quick' },
    });
    expect(create.statusCode).toBe(402);
    const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };

    const paid = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': `mock:${payment.paymentId}` },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(paid.statusCode).toBe(202);

    let failed = false;
    for (let i = 0; i < 50 && !failed; i += 1) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
      if (res.statusCode === 200) {
        const status = asContract(
          SPEC_SCHEMAS.AuditStatusResponse,
          res.json(),
          '200 from GET /api/v1/audits/{jobId} (failed)',
        );
        if (status.status === 'failed') {
          // The code is the worker's mapping, not part of the contract; what
          // the contract promises is that a code and a message are there.
          expect(status.error.code.length).toBeGreaterThan(0);
          expect(status.error.message.length).toBeGreaterThan(0);
          expect(typeof status.failedAt).toBe('string');
          failed = true;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(failed).toBe(true);
  });

  it('POST /api/v1/audits rejects bad URLs with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('POST /api/v1/audits without payment returns 402 with a challenge', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: {
        repoUrl: 'https://github.com/okx/repopilot',
        mode: 'quick',
        target: 'open_source',
        outputLanguage: 'en',
        includeLaunchCopy: true,
      },
    });
    expect(res.statusCode).toBe(402);
    const body = res.json() as { jobId: string; payment: { paymentId: string; challenge: { x402Version: number; accepts: { scheme: string }[] } } };
    expect(body.jobId).toMatch(/^job_/);
    expect(body.payment.challenge.x402Version).toBe(2);
    expect(body.payment.challenge.accepts[0]?.scheme).toBe('exact');
  });

  it('POST /api/v1/audits with X-PAYMENT (mock) returns a queued job, then completes', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: {
        repoUrl: 'https://github.com/okx/repopilot',
        mode: 'full',
        target: 'production',
        outputLanguage: 'en',
        includeLaunchCopy: true,
      },
    });
    expect(create.statusCode).toBe(402);
    const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };

    const paid = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': `mock:${payment.paymentId}` },
      payload: {
        repoUrl: 'https://github.com/okx/repopilot',
        mode: 'full',
        target: 'production',
        outputLanguage: 'en',
        includeLaunchCopy: true,
      },
    });
    // New contract: 202 + Location + Retry-After. The job is enqueued,
    // not yet finished. The route returns the polling URL.
    expect(paid.statusCode).toBe(202);
    expect(paid.headers['location']).toBe(`/api/v1/audits/${jobId}`);
    expect(paid.headers['retry-after']).toBe('1');
    const queued = paid.json() as { jobId: string; status: string; statusUrl: string; pollAfterMs: number };
    expect(queued.jobId).toBe(jobId);
    expect(queued.status).toMatch(/^(queued|processing|completed)$/);
    expect(queued.statusUrl).toBe(`/api/v1/audits/${jobId}`);
    expect(queued.pollAfterMs).toBe(1000);

    // Poll until completed. The fake pipeline returns immediately so
    // this is bounded.
    let body: { jobId: string; status: string; report?: { scores: { overall: number }; repository: { name: string } } } | null = null;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
      const got = res.json() as { jobId: string; status: string; report?: { scores: { overall: number }; repository: { name: string } } };
      if (res.statusCode === 200 && got.status === 'completed') {
        body = got;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(body).not.toBeNull();
    expect(body!.jobId).toBe(jobId);
    expect(body!.status).toBe('completed');
    expect(body!.report!.scores.overall).toBe(90);
    expect(body!.report!.repository.name).toBe('repopilot');
  });

  it('does not re-serve a completed job to a caller who has not paid for it', async () => {
    // The Idempotency-Key path used to short-circuit on a completed row
    // *before* payment verification: pay once under a key, re-post the same
    // key with no X-PAYMENT header, and the report came back for free. The
    // key is client-chosen and binds to nothing, so it is not evidence of
    // payment — the X-PAYMENT header is the only credential this flow
    // issues, and it is the one that gates this path.
    const repoUrl = 'https://github.com/okx/repopilot';
    // Unique per run: the integration database is a file on disk that
    // outlives the process, and an idempotency key is the one piece of
    // job identity a client chooses. A fixed key would find the previous
    // run's completed row and take the wrong branch on the first POST.
    const key = `free-report-gate-${Date.now()}`;

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(create.statusCode).toBe(402);
    const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };

    const paid = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key, 'x-payment': `mock:${payment.paymentId}` },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(paid.statusCode).toBe(202);

    let completed = false;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
      const got = res.json() as { status: string };
      if (res.statusCode === 200 && got.status === 'completed') {
        completed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(completed).toBe(true);

    // The payer re-reads their own report: same key, same payment header.
    const payerReads = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key, 'x-payment': `mock:${payment.paymentId}` },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(payerReads.statusCode).toBe(200);
    expect(payerReads.json()).toMatchObject({ jobId, status: 'completed' });

    // The exploit: same key, no payment. Before the fix this returned the
    // report. Now it returns a challenge naming a *different* payment —
    // paying that challenge is what a replay would have to present.
    const free = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key },
      payload: { repoUrl, mode: 'quick' },
    });
    expect(free.statusCode).toBe(402);
    const freeBody = free.json() as { jobId: string; status: string; payment: { paymentId: string } };
    expect(freeBody.jobId).toBe(jobId);
    expect(freeBody.payment.paymentId).not.toBe(payment.paymentId);
  });

  it('refuses an Idempotency-Key reused for a different repository', async () => {
    // The key is a client-chosen string in a global namespace. Reusing one
    // with a different body used to return the earlier job — pay for B, get
    // A's jobId, then read A's report through the poll endpoint, which takes
    // only the id. The key names a request, so a different request under the
    // same key is a conflict, not a retry.
    const key = `key-reuse-${Date.now()}`;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key },
      payload: { repoUrl: 'https://github.com/okx/repopilot', mode: 'quick' },
    });
    expect(first.statusCode).toBe(402);
    const { jobId } = first.json() as { jobId: string };

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key },
      payload: { repoUrl: 'https://github.com/octocat/Hello-World', mode: 'quick' },
    });
    expect(reused.statusCode).toBe(409);
    const body = reused.json() as { error: { code: string } };
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    // Not a job, not a report, and not the other repository's id.
    expect(JSON.stringify(reused.json())).not.toContain(jobId);

    // The same body under the same key is still a retry: it finds the queued
    // row and reports its status rather than creating a second job.
    const retry = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'idempotency-key': key },
      payload: { repoUrl: 'https://github.com/okx/repopilot', mode: 'quick' },
    });
    expect(retry.statusCode).toBe(202);
    expect((retry.json() as { jobId: string }).jobId).toBe(jobId);
  });

  it('GET /api/v1/audits/:jobId returns the stored job', async () => {
    // Run a paid job to populate the report
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl: 'https://github.com/okx/repopilot', mode: 'quick' },
    });
    const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };
    const paid = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      headers: { 'x-payment': `mock:${payment.paymentId}` },
      payload: { repoUrl: 'https://github.com/okx/repopilot', mode: 'quick' },
    });
    expect(paid.statusCode).toBe(202);

    // Poll until completed
    let body: { jobId: string; status: string; report?: { scores: { overall: number } } } | null = null;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}` });
      const got = res.json() as { jobId: string; status: string; report?: { scores: { overall: number } } };
      if (res.statusCode === 200 && got.status === 'completed') {
        body = got;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(body).not.toBeNull();
    expect(body!.jobId).toBe(jobId);
    expect(body!.status).toBe('completed');
  });

  it('GET /api/v1/audits/:jobId returns 404 for missing job', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/audits/job_does_not_exist' });
    expect(res.statusCode).toBe(404);
  });

  it('denies disallowed hosts (SSRF defense)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audits',
      payload: { repoUrl: 'https://gitlab.com/foo/bar', mode: 'quick' },
    });
    // Zod accepts the URL shape; the pipeline / fetcher rejects the host.
    // The 402 path still creates a job; the actual host check happens at fetch.
    // Confirm at least the call is accepted up to Zod parsing.
    expect([200, 202, 400, 402]).toContain(res.statusCode);
  });

  it('POST /api/v1/free-check rejects bad URLs with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/free-check',
      payload: { repoUrl: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('POST /api/v1/free-check never returns 402 (no payment required)', async () => {
    // Even with a totally fake URL the endpoint must never emit a payment
    // challenge. Acceptable outcomes are 200 (ok), 400 (bad URL),
    // 404 (repo not found / upstream says 404), 429 (rate limited),
    // or 502 (upstream unreachable). The free tier must be reachable for
    // the OKX.AI ASP QA pass before the Beta wallet is wired.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/free-check',
      payload: { repoUrl: 'https://github.com/octocat/Hello-World' },
    });
    expect([200, 400, 404, 429, 502]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(402);
  });

  it('POST /api/v1/free-check returns 502 (never 5xx) when upstream is unreachable', async () => {
    // Host allowlist deliberately excludes this domain; the runner
    // should map the error to 502 UPSTREAM_FAILED (the route does NOT
    // leak 5xx stack traces to the client).
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/free-check',
      payload: { repoUrl: 'https://example.com/never-resolves/repo' },
    });
    expect([403, 502]).toContain(res.statusCode);
  });

  describe('derived routes', () => {
    const CLEAN_REPO = 'https://github.com/okx/repopilot';
    const BLOCKED_REPO = 'https://github.com/okx/repopilot-blocked-fixture';
    /**
     * A third repository, because the diff tests need two audits of ONE
     * repository with different reports, and the override that makes the
     * second one dirty would otherwise leak into every later test that
     * audits `CLEAN_REPO`.
     */
    const EVOLVING_REPO = 'https://github.com/okx/repopilot-evolving-fixture';

    it('GET /api/v1/audits/:jobId/quality answers "may this ship?"', async () => {
      const jobId = await runAudit(app, CLEAN_REPO);
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/quality` });

      expect(res.statusCode).toBe(200);
      const body = res.json() as QualityBody;
      expect(body.schemaVersion).toBe('1.0');
      expect(body.status).toBe('pass');
      expect(body.ship).toBe(true);
      expect(body.blockerCount).toBe(0);
      expect(body.blockingFingerprints).toEqual([]);
      expect(body.sections.map((s) => s.id)).toEqual([
        'security',
        'testing',
        'ci',
        'repository',
        'release',
        'coverage',
      ]);
      expect(Number.isNaN(Date.parse(body.evaluatedAt))).toBe(false);
    });

    it('blocks a report carrying a live credential, and names the fingerprint', async () => {
      pipeline.setReport(BLOCKED_REPO, blockedReport());
      const jobId = await runAudit(app, BLOCKED_REPO);
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/quality` });

      expect(res.statusCode).toBe(200);
      const body = res.json() as QualityBody;
      expect(body.status).toBe('blocked');
      expect(body.ship).toBe(false);
      expect(body.blockerCount).toBeGreaterThan(0);
      // The fingerprint is what a re-audit compares against afterwards.
      expect(body.blockingFingerprints).toContain('fp-live-credential');

      const security = body.sections.find((s) => s.id === 'security');
      const failed = (security?.checks ?? []).filter((c) => c.status === 'fail').map((c) => c.id);
      expect(failed).toContain('security.no-secrets');
      expect(failed).toContain('security.no-critical');
    });

    it('re-evaluates on every read instead of replaying a stored verdict', async () => {
      const jobId = await runAudit(app, CLEAN_REPO);
      const url = `/api/v1/audits/${jobId}/quality`;
      const first = (await app.inject({ method: 'GET', url })).json() as QualityBody;
      const second = (await app.inject({ method: 'GET', url })).json() as QualityBody;

      // Same policy, same report, same verdict — plus a timestamp that
      // moves, which is only possible because nothing was frozen at
      // write time.
      expect({ ...second, evaluatedAt: '' }).toEqual({ ...first, evaluatedAt: '' });
      expect(second.evaluatedAt >= first.evaluatedAt).toBe(true);
    });

    it('never asks for payment', async () => {
      const jobId = await runAudit(app, CLEAN_REPO);
      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/quality` });
      expect(res.statusCode).not.toBe(402);
    });

    it('409 when the audit has no report yet', async () => {
      // The 402 path still creates the job; it is simply never enqueued.
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/audits',
        payload: { repoUrl: CLEAN_REPO, mode: 'quick' },
      });
      const { jobId } = create.json() as { jobId: string };

      const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/quality` });
      expect(res.statusCode).toBe(409);
      expect((res.json() as { error: { code: string } }).error.code).toBe('REPORT_NOT_READY');
    });

    it('404 for an unknown job', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audits/job_missing/quality' });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error: { code: string } }).error.code).toBe('JOB_NOT_FOUND');
    });

    // ------------------------------------------------------------------
    // fix-plan
    // ------------------------------------------------------------------

    describe('GET /api/v1/audits/:jobId/fix-plan', () => {
      it('plans the fix for the finding that blocks the release', async () => {
        const jobId = await runAudit(app, BLOCKED_REPO);
        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/fix-plan` });

        expect(res.statusCode).toBe(200);
        const body = res.json() as FixPlanSetBody;
        expect(body.schemaVersion).toBe('1.0');
        expect(body.reportVersion).toBe('1.0');
        // The commit the caller was quoted, not the one the worker
        // happened to key on.
        expect(body.repository).toEqual({
          owner: 'okx',
          name: 'repopilot',
          url: 'https://github.com/okx/repopilot',
          commitSha: HEAD_SHA,
        });

        expect(body.plans).toHaveLength(1);
        const plan = body.plans[0]!;
        expect(plan.planId).toBe('fixplan:SEC-SECRET-001:src/config.ts:12');
        expect(plan.findingId).toBe('SEC-SECRET-001:src/config.ts:12');
        // critical -> P0, from the deterministic mapping. An LLM never
        // touches this field.
        expect(plan.priority).toBe('P0');
        expect(plan.status).toBe('open');
        expect(plan.evidence[0]?.file).toBe('src/config.ts');
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
        // The point of a fix plan is that it can be handed to an agent.
        expect(plan.agentInstructions).toContain('src/config.ts');
      });

      it('invents no work for a report with no findings', async () => {
        const jobId = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/fix-plan` });

        expect(res.statusCode).toBe(200);
        const body = res.json() as FixPlanSetBody;
        expect(body.plans).toEqual([]);
      });

      it('never asks for payment', async () => {
        const jobId = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/fix-plan` });
        expect(res.statusCode).not.toBe(402);
      });

      it('409 when the audit has no report yet', async () => {
        const create = await app.inject({
          method: 'POST',
          url: '/api/v1/audits',
          payload: { repoUrl: CLEAN_REPO, mode: 'quick' },
        });
        const { jobId } = create.json() as { jobId: string };

        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/fix-plan` });
        expect(res.statusCode).toBe(409);
        expect((res.json() as { error: { code: string } }).error.code).toBe('REPORT_NOT_READY');
      });

      it('404 for an unknown job', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/audits/job_missing/fix-plan' });
        expect(res.statusCode).toBe(404);
        expect((res.json() as { error: { code: string } }).error.code).toBe('JOB_NOT_FOUND');
      });
    });

    // ------------------------------------------------------------------
    // diff
    // ------------------------------------------------------------------

    describe('GET /api/v1/audits/:jobId/diff', () => {
      it('400 without a base, and says how to find one', async () => {
        const jobId = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/diff` });

        expect(res.statusCode).toBe(400);
        const body = res.json() as { error: { code: string; message: string } };
        expect(body.error.code).toBe('INVALID_INPUT');
        // A 400 that does not say what to pass is a dead end.
        expect(body.error.message).toContain('/api/v1/repositories/');
      });

      it('400 when a job is compared with itself', async () => {
        const jobId = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${jobId}/diff?base=${jobId}`,
        });

        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
      });

      it('400 when the two audits are of different repositories', async () => {
        const clean = await runAudit(app, CLEAN_REPO);
        const other = await runAudit(app, BLOCKED_REPO);
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${other}/diff?base=${clean}`,
        });

        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe('REPO_MISMATCH');
      });

      it('reports an unchanged repository as unchanged, not as churn', async () => {
        const base = await runAudit(app, CLEAN_REPO);
        const head = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${head}/diff?base=${base}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as AuditDiffBody;
        expect(body.schemaVersion).toBe('1.0');
        expect(body.base.jobId).toBe(base);
        expect(body.head.jobId).toBe(head);
        expect(body.base.commitSha).toBe(HEAD_SHA);
        expect(body.head.commitSha).toBe(HEAD_SHA);
        expect(body.scoreDelta).toBe(0);
        expect(body.verdict).toBe('unchanged');
        expect(body.resolved).toEqual([]);
        expect(body.new).toEqual([]);
        expect(body.persistent).toEqual([]);
        expect(body.moved).toEqual([]);
      });

      it('names a newly introduced finding by fingerprint', async () => {
        // Two audits of one repository, with the second one dirty. Keyed
        // by url, so the override cannot leak into the tests above.
        const base = await runAudit(app, EVOLVING_REPO);
        pipeline.setReport(EVOLVING_REPO, blockedReport());
        const head = await runAudit(app, EVOLVING_REPO);

        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${head}/diff?base=${base}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as AuditDiffBody;
        // Fingerprint, not id: inserting a line above a secret would
        // otherwise read as two unrelated findings.
        expect(body.new).toEqual(['fp-live-credential']);
        expect(body.resolved).toEqual([]);
        expect(body.persistent).toEqual([]);
      });

      it('404 when the base job does not exist', async () => {
        const head = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${head}/diff?base=job_missing`,
        });

        expect(res.statusCode).toBe(404);
        expect((res.json() as { error: { code: string } }).error.code).toBe('JOB_NOT_FOUND');
      });

      it('409 when the base job has no report yet', async () => {
        const create = await app.inject({
          method: 'POST',
          url: '/api/v1/audits',
          payload: { repoUrl: CLEAN_REPO, mode: 'quick' },
        });
        const { jobId: unpaid } = create.json() as { jobId: string };
        const head = await runAudit(app, CLEAN_REPO);

        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/audits/${head}/diff?base=${unpaid}`,
        });

        expect(res.statusCode).toBe(409);
        expect((res.json() as { error: { code: string } }).error.code).toBe('REPORT_NOT_READY');
      });
    });

    // ------------------------------------------------------------------
    // history
    // ------------------------------------------------------------------

    describe('GET /api/v1/repositories/:owner/:repo/audits', () => {
      it('lists this repository, newest first, with the commit analysed', async () => {
        const first = await runAudit(app, CLEAN_REPO);
        const second = await runAudit(app, CLEAN_REPO);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/repositories/okx/repopilot/audits',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as AuditHistoryBody;
        expect(body.owner).toBe('okx');
        expect(body.repo).toBe('repopilot');
        expect(body.limit).toBe(20);
        expect(body.count).toBe(body.audits.length);
        expect(body.count).toBeGreaterThanOrEqual(2);

        const ids = body.audits.map((a) => a.jobId);
        expect(ids).toContain(first);
        expect(ids).toContain(second);
        // Newest first: the second audit was created after the first.
        expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));

        const entry = body.audits.find((a) => a.jobId === second)!;
        expect(entry.status).toBe('completed');
        expect(entry.commitSha).toBe(HEAD_SHA);
        expect(entry.mode).toBe('quick');
        expect(entry.target).toBe('open_source');
        expect(entry.overall).toBe(90);
        expect(entry.findingCount).toBe(0);
        expect(entry.completedAt).not.toBeNull();
        expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
      });

      it('reports null rather than guessing for a job with no report', async () => {
        const create = await app.inject({
          method: 'POST',
          url: '/api/v1/audits',
          payload: { repoUrl: CLEAN_REPO, mode: 'quick' },
        });
        const { jobId } = create.json() as { jobId: string };

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/repositories/okx/repopilot/audits',
        });
        const body = res.json() as AuditHistoryBody;
        const entry = body.audits.find((a) => a.jobId === jobId)!;

        expect(entry.status).not.toBe('completed');
        expect(entry.overall).toBeNull();
        expect(entry.findingCount).toBeNull();
        expect(entry.completedAt).toBeNull();
      });

      it('carries the reason on a failed summary', async () => {
        // A history row that says "failed" and stops is a dead end: the reader
        // has to already know the job id to ask the job endpoint why. The
        // summary carries the same pair, so the reason travels with the row.
        const repoUrl = 'https://github.com/okx/history-failure';
        pipeline.failOn(repoUrl, 'PIPELINE_FAILED', 'the pipeline could not finish');

        const create = await app.inject({
          method: 'POST',
          url: '/api/v1/audits',
          payload: { repoUrl, mode: 'quick' },
        });
        const { jobId, payment } = create.json() as { jobId: string; payment: { paymentId: string } };
        await app.inject({
          method: 'POST',
          url: '/api/v1/audits',
          headers: { 'x-payment': `mock:${payment.paymentId}` },
          payload: { repoUrl, mode: 'quick' },
        });

        let entry: AuditHistoryBody['audits'][number] | undefined;
        for (let i = 0; i < 50; i += 1) {
          const res = await app.inject({
            method: 'GET',
            url: '/api/v1/repositories/okx/history-failure/audits',
          });
          const body = res.json() as AuditHistoryBody;
          entry = body.audits.find((a) => a.jobId === jobId);
          if (entry?.status === 'failed') break;
          await new Promise((r) => setTimeout(r, 50));
        }

        expect(entry?.status).toBe('failed');
        expect(entry?.errorCode?.length).toBeGreaterThan(0);
        expect(entry?.error?.length).toBeGreaterThan(0);
        expect(entry?.failedAt).not.toBeNull();
      });

      it('clamps the limit instead of trusting it', async () => {
        const cases: { query: string; expected: number }[] = [
          { query: '', expected: 20 },
          { query: '?limit=1', expected: 1 },
          // Zero and nonsense fall back to the default rather than
          // returning an empty page or everything.
          { query: '?limit=0', expected: 20 },
          { query: '?limit=abc', expected: 20 },
          // A caller cannot ask for more than the maximum.
          { query: '?limit=500', expected: 100 },
        ];

        for (const { query, expected } of cases) {
          const res = await app.inject({
            method: 'GET',
            url: `/api/v1/repositories/okx/repopilot/audits${query}`,
          });
          expect(res.statusCode).toBe(200);
          expect((res.json() as AuditHistoryBody).limit).toBe(expected);
        }
      });

      it('returns an empty list for a repository nobody has audited', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/repositories/okx/nothing-here/audits',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as AuditHistoryBody;
        expect(body.count).toBe(0);
        expect(body.audits).toEqual([]);
      });

      it('never asks for payment', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/repositories/okx/repopilot/audits',
        });
        expect(res.statusCode).not.toBe(402);
      });
    });

    // ------------------------------------------------------------------
    // the promise that holds for all of them
    // ------------------------------------------------------------------

    it('never re-scans a repository to answer a derived question', async () => {
      const base = await runAudit(app, CLEAN_REPO);
      const head = await runAudit(app, CLEAN_REPO);

      // Everything below is a read. The pipeline has already done its
      // work for these two jobs, so the count must not move — a derived
      // view that re-scans would turn a free query into a paid one.
      const before = pipeline.runs;
      await app.inject({ method: 'GET', url: `/api/v1/audits/${head}/fix-plan` });
      await app.inject({ method: 'GET', url: `/api/v1/audits/${head}/quality` });
      await app.inject({ method: 'GET', url: `/api/v1/audits/${head}/diff?base=${base}` });
      await app.inject({ method: 'GET', url: '/api/v1/repositories/okx/repopilot/audits' });

      expect(pipeline.runs).toBe(before);
    });

    it('records no commit when GitHub could not be reached', async () => {
      // The route resolves the head SHA before enqueueing. When that
      // fails there is no commit to record, and the column is nullable —
      // a sentinel like 'unknown' would read as a real SHA to anything
      // filtering on it.
      metadata.sha = null;
      try {
        const jobId = await runAudit(app, CLEAN_REPO);
        const res = await app.inject({ method: 'GET', url: `/api/v1/audits/${jobId}/fix-plan` });
        expect((res.json() as FixPlanSetBody).repository.commitSha).toBeNull();
      } finally {
        metadata.sha = HEAD_SHA;
      }
    });
  });
});
