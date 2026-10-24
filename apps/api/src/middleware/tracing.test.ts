/**
 * The HTTP span: what it is named, what it carries, and when it is an error.
 *
 * `app.inject()` drives the real lifecycle — onRequest, handler, onResponse —
 * so this is the same path a socket takes, without the socket.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  initTelemetry,
  injectTraceContext,
  withSpan,
  type TelemetryHandle,
} from '../telemetry.js';
import { registerTracing, routeTemplate } from './tracing.js';

const exporter = new InMemorySpanExporter();
let handle: TelemetryHandle;

beforeAll(() => {
  handle = initTelemetry({
    exporter: 'otlp',
    serviceName: 'repopilot-http-test',
    spanExporter: exporter,
  });
});

async function appWithTracing() {
  const app = Fastify({ logger: false });
  registerTracing(app);
  return app;
}

async function finishedSpans() {
  await handle.flush();
  return exporter.getFinishedSpans();
}

describe('routeTemplate', () => {
  it('turns Fastify params into the OpenTelemetry syntax', () => {
    expect(routeTemplate('/api/v1/audits/:jobId')).toBe('/api/v1/audits/{jobId}');
    expect(routeTemplate('/a/:x/b/:y')).toBe('/a/{x}/b/{y}');
    expect(routeTemplate('/health')).toBe('/health');
  });
});

describe('registerTracing', () => {
  it('names the span after the route template, not the URL', async () => {
    const app = await appWithTracing();
    app.get('/things/:id', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/things/abc?verbose=1' });
    expect(res.statusCode).toBe(200);
    await app.close();

    const span = (await finishedSpans()).find((s) => s.name === 'GET /things/{id}');
    expect(span).toBeDefined();
    expect(span?.attributes['http.route']).toBe('/things/{id}');
    expect(span?.attributes['http.request.method']).toBe('GET');
    expect(span?.attributes['url.path']).toBe('/things/abc');
    expect(span?.attributes['http.response.status_code']).toBe(200);
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks a 5xx as an error', async () => {
    const app = await appWithTracing();
    app.get('/boom', async () => {
      throw new Error('kaboom');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    await app.close();

    const span = (await finishedSpans()).find((s) => s.name === 'GET /boom');
    expect(span?.attributes['http.response.status_code']).toBe(500);
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('keeps the handler inside the span, so an enqueue span is its child', async () => {
    // This is the property the queue propagation depends on: the span started
    // in onRequest must be active while the handler runs, or `withSpan` in the
    // route would create a second root.
    let carrier: ReturnType<typeof injectTraceContext> = {};

    const app = await appWithTracing();
    app.get('/child', async () => {
      await withSpan('handler.child', {}, () => {
        carrier = injectTraceContext();
      });
      return { ok: true };
    });

    await app.inject({ method: 'GET', url: '/child' });
    await app.close();

    const spans = await finishedSpans();
    const server = spans.find((s) => s.name === 'GET /child');
    const child = spans.find((s) => s.name === 'handler.child');
    expect(server).toBeDefined();
    expect(child?.parentSpanContext?.spanId).toBe(server?.spanContext().spanId);
    expect(carrier.traceparent).toContain(server?.spanContext().traceId);
  });
});
