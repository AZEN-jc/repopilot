/**
 * The trace export switch, and the two things that make it usable: a span
 * carries the service name, and a trace context survives a round trip through
 * a carrier.
 *
 * The provider is process-global and can only be registered once, so this file
 * registers one at the top and every test works against it. The "off" state is
 * a separate file (`telemetry.disabled.test.ts`) for the same reason — it must
 * run in a process where nothing was ever registered.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  initTelemetry,
  injectTraceContext,
  isTelemetryEnabled,
  runInTraceContext,
  tracesUrl,
  withSpan,
  type TelemetryHandle,
} from './telemetry.js';

const exporter = new InMemorySpanExporter();
let handle: TelemetryHandle;

beforeAll(() => {
  handle = initTelemetry({
    exporter: 'otlp',
    endpoint: 'http://collector.invalid:4318',
    serviceName: 'repopilot-test',
    spanExporter: exporter,
  });
});

async function finished() {
  await handle.flush();
  return exporter.getFinishedSpans();
}

describe('tracesUrl', () => {
  it('appends the signal path to a base endpoint', () => {
    expect(tracesUrl('http://collector:4318')).toBe('http://collector:4318/v1/traces');
    expect(tracesUrl('http://collector:4318/')).toBe('http://collector:4318/v1/traces');
  });

  it('leaves a URL that already names the signal alone', () => {
    expect(tracesUrl('https://otlp.example.com/v1/traces')).toBe(
      'https://otlp.example.com/v1/traces',
    );
  });

  it('returns undefined when there is no endpoint', () => {
    expect(tracesUrl('')).toBeUndefined();
    expect(tracesUrl(undefined)).toBeUndefined();
    expect(tracesUrl('   ')).toBeUndefined();
  });
});

describe('initTelemetry', () => {
  it('reports that tracing is on', () => {
    expect(isTelemetryEnabled()).toBe(true);
    expect(handle.enabled).toBe(true);
  });

  it('is idempotent: a second call returns the registered handle', () => {
    const again = initTelemetry({
      exporter: 'console',
      serviceName: 'second-call',
    });
    expect(again).toBe(handle);
  });
});

describe('withSpan', () => {
  it('records the span name, attributes and the resource service name', async () => {
    await withSpan('unit.span', { 'repopilot.job_id': 'job-1' }, async () => undefined);
    const spans = await finished();
    const span = spans.find((s) => s.name === 'unit.span');
    expect(span).toBeDefined();
    expect(span?.attributes['repopilot.job_id']).toBe('job-1');
    expect(span?.resource.attributes['service.name']).toBe('repopilot-test');
  });

  it('marks a thrown error on the span and re-throws it unchanged', async () => {
    const boom = new Error('kaboom');
    await expect(
      withSpan('unit.error', {}, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const span = (await finished()).find((s) => s.name === 'unit.error');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('leaves the status unset on success', async () => {
    // UNSET, not OK: a caller that handles a failure inside the callback
    // (the worker writes a failed row and returns) sets ERROR itself, and a
    // blanket OK here would overwrite it.
    await withSpan('unit.ok', {}, async () => undefined);
    const span = (await finished()).find((s) => s.name === 'unit.ok');
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);
  });
});

describe('trace context propagation', () => {
  it('carries the parent trace and span ids through a carrier', async () => {
    let carrier: ReturnType<typeof injectTraceContext> = {};
    let parent: { traceId: string; spanId: string } | undefined;

    await withSpan('producer', {}, async (span) => {
      const ctx = span.spanContext();
      parent = { traceId: ctx.traceId, spanId: ctx.spanId };
      carrier = injectTraceContext();
      expect(carrier.traceparent).toContain(ctx.traceId);

      await runInTraceContext(carrier, () => withSpan('consumer', {}, () => undefined));
    });

    const consumer = (await finished()).find((s) => s.name === 'consumer');
    expect(parent).toBeDefined();
    expect(consumer?.spanContext().traceId).toBe(parent?.traceId);
    expect(consumer?.parentSpanContext?.spanId).toBe(parent?.spanId);
  });

  it('starts a fresh trace when the carrier is absent', async () => {
    let traceId: string | undefined;
    await runInTraceContext(undefined, async () => {
      await withSpan('orphan', {}, (span) => {
        traceId = span.spanContext().traceId;
      });
    });
    const span = (await finished()).find((s) => s.name === 'orphan');
    expect(span?.parentSpanContext?.spanId).toBeUndefined();
    expect(span?.spanContext().traceId).toBe(traceId);
  });

  it('returns an empty carrier when there is no active span', () => {
    // Outside any span there is nothing to inject; the caller spreads the
    // result into a payload either way, so `{}` is the contract.
    expect(injectTraceContext()).toEqual({});
  });
});
