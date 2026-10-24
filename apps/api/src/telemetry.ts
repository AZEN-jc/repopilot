/**
 * Trace export.
 *
 * Traces are **off unless configured**. With no exporter, `initTelemetry`
 * registers nothing, the OpenTelemetry API stays on its no-op implementation,
 * and every `withSpan` in `@repopilot/core` costs one allocation and returns.
 * That default is deliberate: a self-hosted deployment with no collector
 * should not start a batch processor, open a socket, or hold a timer.
 *
 * When it is on, the exporter is OTLP over HTTP — the one protocol every
 * collector speaks — and the endpoint is the standard
 * `OTEL_EXPORTER_OTLP_ENDPOINT` base URL, with `/v1/traces` appended the way
 * the specification says. `console` exists for a developer who wants to see a
 * span without running a collector; it is not for production, because it
 * writes to stdout at `info` volume.
 *
 * The span helpers themselves live in `@repopilot/core` (they are used by the
 * pipeline, which runs in three different hosts) and are re-exported here so
 * app code has one import site.
 */
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export {
  currentTraceId,
  extractTraceContext,
  injectTraceContext,
  runInTraceContext,
  tracer,
  withSpan,
  type TraceCarrier,
} from '@repopilot/core';

export type TraceExporterKind = 'none' | 'otlp' | 'console';

export interface TelemetryOptions {
  exporter: TraceExporterKind;
  /** Base OTLP HTTP endpoint, e.g. `http://localhost:4318`. */
  endpoint?: string;
  /** `service.name` on every span. The only attribute a collector needs. */
  serviceName: string;
  /**
   * Test seam: an exporter to hand to the provider instead of building one.
   * Implies `exporter: 'otlp'` for the purpose of turning tracing on.
   */
  spanExporter?: SpanExporter;
}

export interface TelemetryHandle {
  enabled: boolean;
  /** Push what is buffered now. Tests need this; shutdown does it too. */
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

let handle: TelemetryHandle | null = null;

const DISABLED: TelemetryHandle = {
  enabled: false,
  flush: async () => undefined,
  shutdown: async () => undefined,
};

/**
 * Append `/v1/traces` unless the caller already named the signal path.
 *
 * The SDK's own default is the full URL, but `OTEL_EXPORTER_OTLP_ENDPOINT` is
 * specified as a base — passing `http://collector:4318` through untouched
 * would post to `/` and be answered with a 404 the batch processor reports
 * only to the diagnostic logger.
 */
export function tracesUrl(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  const base = endpoint.trim().replace(/\/+$/, '');
  if (base === '') return undefined;
  return base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
}

/**
 * Register the tracer provider, once per process.
 *
 * Idempotent because two call sites can race to it — `main()` in the API and
 * `main()` in the worker are the same file when both run in one process
 * (`REPOPILOT_API_MODE=combined` is the default) — and a second
 * `provider.register()` would replace the first provider's exporter with a
 * second batch processor writing to the same collector.
 */
export function initTelemetry(opts: TelemetryOptions): TelemetryHandle {
  if (handle) return handle;

  if (opts.exporter === 'none' && !opts.spanExporter) {
    handle = DISABLED;
    return handle;
  }

  const exporter: SpanExporter =
    opts.spanExporter ??
    (opts.exporter === 'console'
      ? new ConsoleSpanExporter()
      : new OTLPTraceExporter({ url: tracesUrl(opts.endpoint) }));

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: opts.serviceName }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();

  handle = {
    enabled: true,
    flush: async () => {
      await provider.forceFlush();
    },
    shutdown: async () => {
      try {
        await provider.shutdown();
      } finally {
        handle = null;
      }
    },
  };
  return handle;
}

/** Whether a provider was registered. The HTTP hooks skip work when false. */
export function isTelemetryEnabled(): boolean {
  return handle?.enabled === true;
}
