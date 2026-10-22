/**
 * Service-level routes: `/` and `/docs/openapi.json`.
 *
 * These lived inline in `server.ts`, which is why they were the two endpoints
 * the published contract did not mention: every other route is registered by a
 * `register*Routes()` function, and `apps/api/src/openapi.test.ts` compares the
 * contract against those registrations. A route written straight onto the
 * instance was invisible to that comparison — and to the document.
 *
 * Moving them here is not tidying for its own sake. It is what lets the gate
 * have no exemption list: every route the process serves now comes from a
 * registrar the test can mount, so a new endpoint that nobody documented fails
 * a test instead of quietly shipping.
 */
import type { FastifyInstance } from 'fastify';
import { CORE_VERSION } from '@repopilot/core';
import { buildOpenApiSpec } from '../openapi.js';

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get('/', async () => ({
    name: 'RepoPilot',
    version: CORE_VERSION,
    endpoints: [
      '/health',
      '/api/v1/capabilities',
      '/api/v1/free-check',
      '/api/v1/audits',
      '/docs/openapi.json',
    ],
  }));

  app.get('/docs/openapi.json', async () => buildOpenApiSpec());
}
