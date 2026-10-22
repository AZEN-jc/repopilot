/**
 * The published contract, checked against the code it describes.
 *
 * Why this file exists
 * --------------------
 * `apps/api/src/openapi.ts` is what an external client codes against. Nothing
 * tested it. Not "nothing tested it well" — there was no test that read the
 * document at all, which is how `components.schemas` came to describe a
 * `CapabilitiesResponse.endpoints` shape the route has never emitted, and a
 * `CreateAuditRequest.mode` default (`quick`) that the schema has not had
 * since R-37 (`full`). Both were found by reading the file against the routes
 * by hand, which is not a thing that happens on a schedule.
 *
 * The schemas are generated now (`openapi-schemas.ts`), so a shape cannot drift
 * from its source. What generation cannot do is notice that a **route** exists
 * and the document does not mention it: `paths` is still written by a person.
 * That is what the first test below is for, and it is the reason `/` and
 * `/docs/openapi.json` moved out of `server.ts` into `routes/meta.ts` — a route
 * registered straight onto the instance was invisible to this comparison, so
 * the gate would have had to carry an exemption list, and a list of exemptions
 * is a list nobody re-reads.
 */
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { buildOpenApiSpec } from './openapi.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerHealthRoutes, type HealthDeps } from './routes/health.js';
import { registerCapabilitiesRoutes, type CapabilitiesDeps } from './routes/capabilities.js';
import { registerFreeCheckRoutes, type FreeCheckRoutesDeps } from './routes/free-check.js';
import { registerAuditRoutes, type AuditRoutesDeps } from './routes/audits.js';
import { registerAuditDerivedRoutes, type AuditDerivedRoutesDeps } from './routes/audit-derived.js';

/**
 * A dependency bag that satisfies the type and is never read.
 *
 * Registration only declares handlers; every `deps.*` read happens inside one.
 * If that stops being true the test throws on an undefined property, which is
 * the right failure — it means a route now decides something at boot and the
 * stub has to become a real value.
 */
function stub<T>(): T {
  return {} as unknown as T;
}

type Spec = Record<string, unknown>;

/**
 * Every route the process actually serves, as `METHOD /path`.
 *
 * Collected from Fastify's own `onRoute` hook rather than by scanning
 * `app.get(` calls: the hook sees what the instance registered, including
 * anything a plugin adds indirectly, and it cannot be fooled by a route written
 * in a different style.
 */
async function registeredRoutes(): Promise<string[]> {
  const app = Fastify({ exposeHeadRoutes: false });
  const seen: string[] = [];
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) seen.push(`${method} ${route.url}`);
  });

  registerMetaRoutes(app);
  registerHealthRoutes(app, stub<HealthDeps>());
  registerCapabilitiesRoutes(app, stub<CapabilitiesDeps>());
  registerFreeCheckRoutes(app, stub<FreeCheckRoutesDeps>());
  registerAuditRoutes(app, stub<AuditRoutesDeps>());
  registerAuditDerivedRoutes(app, stub<AuditDerivedRoutesDeps>());

  await app.ready();
  await app.close();
  return seen;
}

/** `:jobId` (Fastify) and `{jobId}` (OpenAPI) are the same segment. */
function normalise(route: string): string {
  return route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** Every operation in the document, as `METHOD /path`. */
function documentedOperations(spec: Spec): string[] {
  const paths = spec['paths'] as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  for (const [path, operations] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (method === 'parameters' || method === '$ref') continue;
      if (typeof operation !== 'object' || operation === null) continue;
      out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out;
}

/** Depth-first walk over every object in a JSON-ish value. */
function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const value of Object.values(obj)) walk(value, visit);
}

const spec = buildOpenApiSpec() as Spec;

describe('the published contract covers the service', () => {
  it('documents every route the app registers, and invents none', async () => {
    const actual = new Set((await registeredRoutes()).map(normalise));
    const documented = new Set(documentedOperations(spec));

    const undocumented = [...actual].filter((r) => !documented.has(r)).sort();
    const phantom = [...documented].filter((r) => !actual.has(r)).sort();

    expect(
      undocumented,
      'these routes are served but missing from paths — add them to openapi.ts',
    ).toEqual([]);
    expect(
      phantom,
      'these operations are documented but no route serves them — remove or fix them',
    ).toEqual([]);
  });

  it('declares every tag its operations use', () => {
    const declared = new Set(
      (spec['tags'] as { name: string }[]).map((t) => t.name),
    );
    const used = new Set<string>();
    walk(spec['paths'], (obj) => {
      const tags = obj['tags'];
      if (Array.isArray(tags)) for (const t of tags) if (typeof t === 'string') used.add(t);
    });
    // A tag with no `tags` entry is not an error to every client — but the
    // generated documentation groups by tag, so an undeclared one renders as a
    // section with no description. `derived` was in that state for six
    // operations.
    expect([...used].filter((t) => !declared.has(t)).sort()).toEqual([]);
  });

  it('gives every operation a unique operationId', () => {
    const ids: string[] = [];
    walk(spec['paths'], (obj) => {
      const id = obj['operationId'];
      if (typeof id === 'string') ids.push(id);
    });
    expect(ids.length).toBe(documentedOperations(spec).length);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });
});

describe('the published contract is internally sound', () => {
  it('resolves every $ref', () => {
    const schemas = (spec['components'] as Spec)['schemas'] as Record<string, unknown>;
    const missing: string[] = [];
    walk(spec, (obj) => {
      const ref = obj['$ref'];
      if (typeof ref !== 'string') return;
      const prefix = '#/components/schemas/';
      if (!ref.startsWith(prefix)) {
        missing.push(`${ref} (not a components/schemas reference)`);
        return;
      }
      if (!(ref.slice(prefix.length) in schemas)) missing.push(ref);
    });
    expect(missing).toEqual([]);
  });

  it('references every component it publishes', () => {
    const schemas = (spec['components'] as Spec)['schemas'] as Record<string, unknown>;
    const referenced = new Set<string>();
    walk(spec['paths'], (obj) => {
      const ref = obj['$ref'];
      if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) {
        referenced.add(ref.slice('#/components/schemas/'.length));
      }
    });
    // A component nothing references is a shape the document promises and no
    // operation returns. It is also how a rename leaves its predecessor
    // behind, looking authoritative.
    expect(Object.keys(schemas).filter((name) => !referenced.has(name)).sort()).toEqual([]);
  });

  it('uses no OpenAPI 3.0-only keywords', () => {
    // `nullable` was removed in 3.1 in favour of `type: [T, 'null']`. This
    // document has always declared 3.1.0 and used `nullable` throughout, so a
    // strict validator rejected it and a lenient one read `nullable: true` as
    // an unknown keyword — leaving the field required and non-null.
    const offenders: string[] = [];
    walk(spec, (obj) => {
      if ('nullable' in obj) offenders.push(JSON.stringify(obj).slice(0, 120));
    });
    expect(offenders).toEqual([]);
  });

  it('declares a version and a title', () => {
    const info = spec['info'] as Record<string, unknown>;
    expect(info['title']).toBe('RepoPilot API');
    expect(typeof info['version']).toBe('string');
    expect(spec['openapi']).toBe('3.1.0');
  });

  it('does not close response objects the server leaves open', () => {
    // `zod-to-json-schema` writes `additionalProperties: false` for every
    // `z.object()`, but Zod's default object strips unknown keys rather than
    // rejecting them — so that keyword would publish a promise the server does
    // not keep, and would make the next additive field a breaking change for a
    // generated client. `toJsonSchema()` removes it; this is what notices if
    // that removal stops working.
    const closed: string[] = [];
    walk(spec, (obj) => {
      if (obj['additionalProperties'] === false) closed.push(JSON.stringify(obj).slice(0, 120));
    });
    expect(closed).toEqual([]);
  });
});
