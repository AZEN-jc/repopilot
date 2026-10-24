/**
 * The wire: a real OTLP/HTTP exporter, a real socket, a fake collector.
 *
 * `telemetry.test.ts` proves spans are recorded; this proves they leave the
 * process, at the path the specification names. The two failures it covers are
 * both silent in production — a base URL that is posted to as-is (404 on `/`),
 * and a batch processor that is never flushed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initTelemetry, withSpan, type TelemetryHandle } from './telemetry.js';

const received: Array<{ url: string | undefined; body: string }> = [];
let server: Server;
let handle: TelemetryHandle;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      received.push({ url: req.url, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  handle = initTelemetry({
    exporter: 'otlp',
    // A base URL, exactly as an operator would write it.
    endpoint: `http://127.0.0.1:${port}`,
    serviceName: 'repopilot-wire-test',
  });
});

afterAll(async () => {
  await handle.shutdown();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('OTLP export', () => {
  it('posts the span to /v1/traces on the configured endpoint', async () => {
    await withSpan('wire.span', { 'repopilot.job_id': 'job-wire' }, () => undefined);
    await handle.flush();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]?.url).toBe('/v1/traces');
    // JSON body: the span name and the service name are both in it.
    expect(received[0]?.body).toContain('wire.span');
    expect(received[0]?.body).toContain('repopilot-wire-test');
  });
});
