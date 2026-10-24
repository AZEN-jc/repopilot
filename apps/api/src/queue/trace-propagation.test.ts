/**
 * The queue hop, end to end within one process.
 *
 * The API answers 202 and forgets the request; the worker picks the job up
 * later. What joins the two traces is the payload — so this test asserts the
 * only thing that matters: the worker's span is a child of the span that was
 * active when `enqueue` was called.
 *
 * pg-boss's handler does the same `runInTraceContext` around `runOne`; it is
 * not exercised here because it needs a real PostgreSQL, and the propagation
 * logic it calls is the same function this test drives.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  initTelemetry,
  injectTraceContext,
  withSpan,
  type TelemetryHandle,
  type TraceCarrier,
} from '../telemetry.js';
import { InlineAuditQueue } from './inline-audit-queue.js';

const exporter = new InMemorySpanExporter();
let handle: TelemetryHandle;

beforeAll(() => {
  handle = initTelemetry({
    exporter: 'otlp',
    serviceName: 'repopilot-queue-test',
    spanExporter: exporter,
  });
});

/** Enqueue one job, let the queue drain, and return the id it was given. */
async function runOneJob(carrier: TraceCarrier | undefined): Promise<string> {
  const jobId = `job-${Math.random().toString(36).slice(2)}`;
  const queue = new InlineAuditQueue({
    runOne: async (id) => {
      await withSpan('audit.job', { 'repopilot.job_id': id }, () => undefined);
    },
    shutdownGraceMs: 2_000,
    concurrency: 1,
  });

  await queue.start();
  await queue.enqueue({ jobId, ...carrier });
  await queue.stop();
  await handle.flush();
  return jobId;
}

function spanFor(jobId: string) {
  return exporter
    .getFinishedSpans()
    .find((s) => s.name === 'audit.job' && s.attributes['repopilot.job_id'] === jobId);
}

describe('trace context through the inline queue', () => {
  it('runs the worker attempt as a child of the enqueuing span', async () => {
    let request: { traceId: string; spanId: string } | undefined;
    let carrier: TraceCarrier = {};

    // Capture the context inside the request, then enqueue *after* that span
    // has ended. Enqueuing inside it would let the ambient async context
    // leak into the inline driver's synchronous dispatch, and the test would
    // pass even with the carrier ignored — which is exactly what the first
    // draft of this test did. Outside the span, the payload is the only
    // possible source of the parent.
    await withSpan('POST /api/v1/audits', {}, async (span) => {
      const ctx = span.spanContext();
      request = { traceId: ctx.traceId, spanId: ctx.spanId };
      carrier = injectTraceContext();
    });

    const jobId = await runOneJob(carrier);
    const job = spanFor(jobId);
    expect(request).toBeDefined();
    expect(job?.spanContext().traceId).toBe(request?.traceId);
    expect(job?.parentSpanContext?.spanId).toBe(request?.spanId);
  });

  it('starts a fresh trace when the payload carries no context', async () => {
    const jobId = await runOneJob(undefined);
    const job = spanFor(jobId);
    expect(job).toBeDefined();
    expect(job?.parentSpanContext?.spanId).toBeUndefined();
  });
});
