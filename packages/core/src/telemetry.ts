/**
 * OpenTelemetry helpers.
 *
 * Nothing in this file starts a tracer provider. Until one is registered the
 * API's `trace.getTracer()` returns a no-op tracer, every span is
 * non-recording, and the only cost is an object allocation per call — so the
 * instrumentation below is always compiled in, and the switch that matters is
 * whether `apps/api`'s `initTelemetry()` was called with an exporter.
 *
 * The helpers live in `core` rather than `apps/api` because the pipeline, the
 * fetcher and the metadata analyzer are all in `core`, and `core` runs inside
 * three hosts (API, worker, MCP server). Duplicating them per host would give
 * three chances for the span names to drift apart.
 */
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  type Attributes,
  type Context,
  type Span,
  type Tracer,
} from '@opentelemetry/api';

/**
 * One tracer name for every span this project emits.
 *
 * Not per-package: the tracer name ends up in the instrumentation scope, and
 * splitting it by package would make "show me every span for one audit"
 * require knowing which package emitted which span.
 */
export const TRACER_NAME = 'repopilot';

export function tracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * A W3C trace context, in the shape it travels in: a queue payload, or an
 * HTTP header carrier.
 *
 * `tracestate` is optional in the specification and almost always absent here
 * (nothing sets vendor state), but dropping it would silently break a
 * deployment that does.
 */
export interface TraceCarrier {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Run `fn` inside a new span, ending it on every exit path.
 *
 * The span is made *active*, so anything `fn` calls — including `fetch` calls
 * several layers down — becomes a child without passing a span object around.
 *
 * A thrown error is recorded on the span and re-thrown unchanged. The span is
 * not the place to decide what an error means; callers already classify.
 *
 * Success leaves the status UNSET rather than setting OK on purpose: some
 * callers handle a failure inside the callback (the worker turns a failed
 * audit into a written row and returns normally), and a blanket `OK` here
 * would overwrite the `ERROR` they set. UNSET already means "no error" to
 * every backend.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * The current trace context, ready to be stored in a queue payload.
 *
 * Returns an empty object when no provider is registered, so a caller can
 * spread it unconditionally: `{ jobId, ...injectTraceContext() }`.
 */
export function injectTraceContext(): TraceCarrier {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const out: TraceCarrier = {};
  const traceparent = carrier['traceparent'];
  const tracestate = carrier['tracestate'];
  if (traceparent) out.traceparent = traceparent;
  if (tracestate) out.tracestate = tracestate;
  return out;
}

/**
 * Rebuild the context a producer sent us. Falls back to the active context
 * when the carrier is absent or unusable, so a job enqueued by an older build
 * (or by hand) still runs — as the root of its own trace.
 */
export function extractTraceContext(carrier: TraceCarrier | undefined): Context {
  if (!carrier?.traceparent) return context.active();
  const bag: Record<string, string> = { traceparent: carrier.traceparent };
  if (carrier.tracestate) bag['tracestate'] = carrier.tracestate;
  return propagation.extract(context.active(), bag);
}

/**
 * Run `fn` as a child of the trace described by `carrier`.
 *
 * This is the queue hop: the API ends its span when the 202 goes out, and the
 * worker starts a new one minutes later in another process. Without this the
 * two are separate traces and the only thing joining them is `jobId` in a log
 * line.
 */
export function runInTraceContext<T>(carrier: TraceCarrier | undefined, fn: () => T): T {
  return context.with(extractTraceContext(carrier), fn);
}

/** The active trace id, for a log line that wants to point at one. */
export function currentTraceId(): string | undefined {
  return trace.getSpan(context.active())?.spanContext().traceId;
}
