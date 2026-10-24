/**
 * One server span per HTTP request.
 *
 * The span is started in `onRequest` and ended in `onResponse`, because that
 * is the pair that brackets the whole lifecycle — hooks, handler, serialiser.
 * The handler runs inside the span's context (`context.with` around `done`),
 * which is what makes the enqueue span a child of the request rather than a
 * second root.
 *
 * The span is renamed in `onResponse`, not started with the route: Fastify
 * resolves the route after `onRequest`, so at start time the only honest name
 * is the raw URL. Renaming costs nothing and turns
 * `POST /api/v1/audits/8f2c…` into `POST /api/v1/audits/{jobId}`, which is the
 * name that aggregates.
 *
 * `onRequestAbort` exists because a client that disconnects never reaches
 * `onResponse`, and an unended span sits in the batch processor until the
 * process exits.
 */
import { context, trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isTelemetryEnabled, tracer } from '../telemetry.js';

const SPAN = Symbol('repopilot.httpSpan');

type WithSpan = FastifyRequest & { [SPAN]?: Span };

function takeSpan(req: FastifyRequest): Span | undefined {
  const holder = req as WithSpan;
  const span = holder[SPAN];
  delete holder[SPAN];
  return span;
}

/** `/api/v1/audits/:jobId` → `/api/v1/audits/{jobId}` (OTel's route syntax). */
export function routeTemplate(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function registerTracing(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    if (!isTelemetryEnabled()) {
      done();
      return;
    }
    const span = tracer().startSpan(`${req.method} ${req.url}`, {
      attributes: {
        'http.request.method': req.method,
        'url.path': req.url.split('?')[0] ?? req.url,
        'server.address': req.hostname,
        'client.address': req.ip,
      },
    });
    (req as WithSpan)[SPAN] = span;
    context.with(trace.setSpan(context.active(), span), done);
  });

  app.addHook('onResponse', (req, reply, done) => {
    const span = takeSpan(req);
    if (span) {
      const route = req.routeOptions?.url;
      if (route) {
        const template = routeTemplate(route);
        span.updateName(`${req.method} ${template}`);
        span.setAttribute('http.route', template);
      }
      span.setAttribute('http.response.status_code', reply.statusCode);
      if (reply.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    }
    done();
  });

  app.addHook('onRequestAbort', (req, done) => {
    const span = takeSpan(req);
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'request aborted' });
      span.end();
    }
    done();
  });
}
