/**
 * The default: no provider, no export, no work.
 *
 * This lives in its own file because the OpenTelemetry API's global provider
 * can be set once per process and never unset. A test that registers one to
 * prove the "on" path cannot also prove the "off" path — so the two are
 * separate processes, and this one is the process that never calls
 * `initTelemetry`.
 */
import { describe, expect, it } from 'vitest';
import { injectTraceContext, isTelemetryEnabled, tracer, withSpan } from './telemetry.js';

describe('tracing is off unless configured', () => {
  it('registers no provider', () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('runs the callback with a non-recording span', async () => {
    const result = await withSpan('unit.noop', { 'repopilot.job_id': 'job-1' }, (span) => {
      expect(span.isRecording()).toBe(false);
      return 42;
    });
    expect(result).toBe(42);
  });

  it('propagates a thrown error without recording it', async () => {
    const boom = new Error('still throws');
    await expect(
      withSpan('unit.noop.error', {}, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('injects no trace context', () => {
    expect(injectTraceContext()).toEqual({});
  });

  it('hands out a tracer that creates non-recording spans', () => {
    const span = tracer().startSpan('unit.span');
    expect(span.isRecording()).toBe(false);
    span.end();
  });
});
