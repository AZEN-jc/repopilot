/**
 * OpenAPI 3.1 spec for RepoPilot.
 *
 * Two halves, built differently on purpose.
 *
 * `paths` is hand-written and lives here, next to the routes, so adding an
 * endpoint forces an explicit review of its public shape — which status codes
 * it can return, which of them are paid, what a 409 means. None of that is
 * derivable from a type, and the reviewer should not have to jump files.
 *
 * `components.schemas` is generated from the Zod schemas in
 * `openapi-schemas.ts`. It used to be a hand-copied literal too, and the copy
 * drifted from the routes in two client-visible ways (see that file's header).
 * A shape now has one definition and the document is a rendering of it.
 *
 * Served at `GET /docs/openapi.json`, and written to `docs/openapi.json` by
 * `pnpm openapi:build` so the published contract can be read and diffed
 * without running the service.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { CORE_VERSION } from '@repopilot/core';
import { SPEC_SCHEMAS, type SpecSchemaName } from './openapi-schemas.js';

/**
 * Convert one Zod schema into the JSON Schema that goes under
 * `components.schemas`.
 *
 * `jsonSchema7` rather than `openApi3`: this document declares 3.1.0, where a
 * nullable field is `type: [T, 'null']` and `nullable: true` is not a keyword
 * at all. The hand-written version used `nullable: true` throughout — 3.0
 * syntax in a 3.1 document, which a strict validator rejects and a lenient one
 * silently reads as "required".
 *
 * `$refStrategy: 'none'` inlines everything, so each component is
 * self-contained and a client can resolve it without the rest of the document.
 * The `$schema` key zod-to-json-schema adds is dropped: inside a 3.1 document
 * it would announce draft-07 for one subschema.
 *
 * `additionalProperties: false` is dropped, and that is a decision rather than
 * tidying. The converter writes it for every `z.object()`, but Zod's default
 * object *strips* unknown keys — it does not reject them — so the document
 * would be closing a shape the server does not close. Worse, generated clients
 * read it as "unknown fields are an error", which turns the next additive
 * response field into a breaking change for them. `additionalProperties` set
 * to a schema (a `z.record`) is kept: that one carries real information.
 */
function toJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const converted = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  stripStrictness(converted);
  delete converted['$schema'];
  return converted;
}

/** Remove every `additionalProperties: false`, at any depth. */
function stripStrictness(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) stripStrictness(item);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Record<string, unknown>;
  if (obj['additionalProperties'] === false) delete obj['additionalProperties'];
  for (const value of Object.values(obj)) stripStrictness(value);
}

function buildSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(SPEC_SCHEMAS)) {
    out[name] = toJsonSchema(schema as ZodTypeAny);
  }
  return out;
}

/** A component reference, by name, checked at the type level. */
function ref(name: SpecSchemaName): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

/** `application/json` body carrying `name`. */
function jsonBody(name: SpecSchemaName): Record<string, unknown> {
  return { 'application/json': { schema: ref(name) } };
}

export function buildOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RepoPilot API',
      version: CORE_VERSION,
      summary: 'GitHub repository launch-readiness audit',
      description:
        'RepoPilot audits a public GitHub repository and returns a ' +
        'structured launch report. Two entry points: a no-payment ' +
        '`/api/v1/free-check` for a quick readiness signal, and a ' +
        'paid `/api/v1/audits` for the full evidence-backed audit.',
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local dev' },
    ],
    tags: [
      { name: 'meta', description: 'Service metadata' },
      { name: 'capabilities', description: 'Public service capabilities' },
      { name: 'free-check', description: 'No-payment entry point' },
      { name: 'audits', description: 'Paid audits' },
      // Declared because six operations use it. It was used and undeclared
      // for as long as the derived views have existed; `openapi.test.ts`
      // now fails on a tag no `tags` entry introduces.
      {
        name: 'derived',
        description:
          'Free read-only views over audits that already happened. No payment, and no repository is scanned.',
      },
    ],
    paths: {
      '/': {
        get: {
          tags: ['meta'],
          summary: 'Service discovery',
          description: 'Name, version, and the paths a client is likely to want next.',
          operationId: 'getRoot',
          responses: {
            '200': {
              description: 'The service identity and its entry points',
              content: jsonBody('RootResponse'),
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['meta'],
          summary: 'Liveness probe',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'Process is up',
              content: jsonBody('HealthResponse'),
            },
          },
        },
      },
      '/api/v1/capabilities': {
        get: {
          tags: ['capabilities'],
          summary: 'Service capabilities',
          operationId: 'getCapabilities',
          responses: {
            '200': {
              description: 'Service capabilities',
              content: jsonBody('CapabilitiesResponse'),
            },
          },
        },
      },
      '/api/v1/free-check': {
        post: {
          tags: ['free-check'],
          summary: 'No-payment repository readiness check',
          description:
            'Returns a slim readiness signal (README/LICENSE/lockfile/CI presence, ' +
            'stack detection, 0–100 score). Never executes repository code. ' +
            'Never reads payment. Rate-limited per IP.',
          operationId: 'freeCheck',
          requestBody: {
            required: true,
            content: jsonBody('FreeCheckRequest'),
          },
          responses: {
            '200': {
              description: 'Free check report',
              content: jsonBody('FreeCheckReport'),
            },
            '400': {
              description: 'Invalid input',
              content: jsonBody('ErrorResponse'),
            },
            '403': {
              description: 'Host not in the allowlist (SSRF defence)',
              content: jsonBody('ErrorResponse'),
            },
            '404': {
              description: 'Repository not found or not accessible',
              content: jsonBody('ErrorResponse'),
            },
            '429': {
              description: 'Rate-limited (per-IP) or upstream GitHub limit',
              content: jsonBody('ErrorResponse'),
            },
            '502': {
              description: 'Upstream failure (GitHub unreachable, etc.)',
              content: jsonBody('ErrorResponse'),
            },
          },
        },
      },
      '/api/v1/audits': {
        post: {
          tags: ['audits'],
          summary: 'Create or replay an audit job',
          description:
            'POST /api/v1/audits is async: it always returns 202 + ' +
            '`Location: /api/v1/audits/{jobId}` + `Retry-After: 1` once ' +
            'payment is verified. The client then polls `GET /api/v1/audits/{jobId}` ' +
            'until the job is `completed` (200) or `failed` (200 with structured error).\n\n' +
            'First call (no `X-PAYMENT`): creates a job and returns 402 with a ' +
            'payment challenge. Replay with `X-PAYMENT` or supply an `Idempotency-Key` ' +
            'header. Both make the request idempotent on the server side.',
          operationId: 'createAudit',
          parameters: [
            {
              name: 'X-PAYMENT',
              in: 'header',
              required: false,
              description: 'Payment receipt (mock: `<id>` or base64-JSON for OKX).',
              schema: { type: 'string' },
            },
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              description: 'Optional client-supplied dedup key. Repeat calls return the same jobId.',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: jsonBody('CreateAuditRequest'),
          },
          responses: {
            '202': {
              description: 'Audit job accepted and queued. Poll GET /api/v1/audits/{jobId}.',
              headers: {
                'Location': {
                  description: 'Path to the job resource for polling.',
                  schema: { type: 'string' },
                },
                'Retry-After': {
                  description: 'Recommended poll interval in seconds.',
                  schema: { type: 'integer', minimum: 1 },
                },
              },
              content: jsonBody('AuditQueuedResponse'),
            },
            '400': {
              description: 'Invalid input',
              content: jsonBody('ErrorResponse'),
            },
            '402': {
              description: 'Payment required / not yet settled',
              content: jsonBody('PaymentChallenge'),
            },
            '429': {
              description: 'Rate-limited',
              content: jsonBody('ErrorResponse'),
            },
            '503': {
              description: 'Queue unavailable; please retry',
              content: jsonBody('EnqueueFailedResponse'),
            },
          },
        },
      },
      '/api/v1/audits/{jobId}': {
        get: {
          tags: ['audits'],
          summary: 'Fetch an audit job',
          operationId: 'getAudit',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Job status: completed (with report) or failed (with structured error).',
              content: jsonBody('AuditStatusResponse'),
            },
            '202': {
              description: 'Job is queued or processing. Retry with Retry-After header.',
              headers: {
                'Retry-After': {
                  description: 'Recommended poll interval in seconds.',
                  schema: { type: 'integer', minimum: 1 },
                },
              },
              content: jsonBody('AuditPendingResponse'),
            },
            '404': {
              description: 'Unknown job',
              content: jsonBody('ErrorResponse'),
            },
          },
        },
      },
      '/api/v1/audits/{jobId}/fix-plan': {
        get: {
          tags: ['derived'],
          summary: 'Fix plans for a completed audit',
          description:
            'Derived from the stored report: one plan per finding, each with evidence, ordered steps, tests to add, acceptance criteria and agent instructions. Free — no payment challenge — and no repository is scanned.',
          operationId: 'getAuditFixPlan',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'A FixPlanSet for the job.',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '404': {
              description: 'Unknown job',
              content: jsonBody('ErrorResponse'),
            },
            '409': {
              description: 'The job has not completed yet, so there is no report to derive from.',
              content: jsonBody('ErrorResponse'),
            },
          },
        },
      },
      '/api/v1/audits/{jobId}/diff': {
        get: {
          tags: ['derived'],
          summary: 'Compare two completed audits of the same repository',
          description:
            'Rule-level attribution of the score change, plus resolved / new / persistent findings. Free, and derived purely from the two stored reports.',
          operationId: 'getAuditDiff',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'base',
              in: 'query',
              required: true,
              description: 'jobId of the earlier audit. List them via the repository history endpoint.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'An AuditDiff.',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '400': {
              description: 'Missing base, self-comparison, or the two audits belong to different repositories.',
              content: jsonBody('ErrorResponse'),
            },
            '404': {
              description: 'Unknown head or base job',
              content: jsonBody('ErrorResponse'),
            },
          },
        },
      },
      '/api/v1/audits/{jobId}/quality': {
        get: {
          tags: ['derived'],
          summary: 'Quality contract for a completed audit — may this ship?',
          description:
            'A deterministic pass / pass_with_warnings / blocked verdict, the blocker and warning counts, and every check with its requirement, what was observed, and the rule ids behind it. Free, derived from the stored report, and re-evaluated on each read so a contract change applies to existing audits. The verdict is never model-assigned.',
          operationId: 'getAuditQuality',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'A QualityContractResult for the job.',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '404': {
              description: 'Unknown job',
              content: jsonBody('ErrorResponse'),
            },
            '409': {
              description: 'The job has not completed yet, so there is no report to evaluate.',
              content: jsonBody('ErrorResponse'),
            },
          },
        },
      },
      '/api/v1/repositories/{owner}/{repo}/reaudit': {
        post: {
          tags: ['derived'],
          summary: 'Re-audit a repository',
          description:
            'Same payment and idempotency path as POST /api/v1/audits, but the repository comes from the path instead of the body. Paid — it runs the pipeline again. This is the write half of the fix → re-audit → compare loop.',
          operationId: 'reauditRepository',
          parameters: [
            {
              name: 'owner',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'repo',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: ref('ReauditRequest'),
              },
            },
          },
          responses: {
            '202': {
              description: 'Job queued. Poll the Location header with Retry-After.',
            },
            '400': {
              description: 'Invalid owner/repo segment or request body.',
              content: jsonBody('ErrorResponse'),
            },
            '402': {
              description: 'Payment required. Replay with X-PAYMENT.',
            },
          },
        },
      },
      '/api/v1/repositories/{owner}/{repo}/audits': {
        get: {
          tags: ['derived'],
          summary: 'Audit history for one repository',
          description:
            'Newest-first summaries. Full reports stay available through GET /api/v1/audits/{jobId}.',
          operationId: 'listRepositoryAudits',
          parameters: [
            {
              name: 'owner',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'repo',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            '200': {
              description: 'Audit summaries for the repository.',
              content: jsonBody('RepoAuditHistory'),
            },
          },
        },
      },
      '/docs/openapi.json': {
        get: {
          tags: ['meta'],
          summary: 'This document',
          description:
            'The OpenAPI 3.1 contract for everything above. Also checked in at `docs/openapi.json`, ' +
            'regenerated from the source by `pnpm openapi:build`.',
          operationId: 'getOpenApiDocument',
          responses: {
            '200': {
              description: 'The OpenAPI document',
              content: jsonBody('OpenApiDocument'),
            },
          },
        },
      },
    },
    components: {
      // Generated from `openapi-schemas.ts`. Nothing below is written by
      // hand, and `openapi.test.ts` proves every entry is referenced.
      schemas: buildSchemas(),
    },
  };
}
