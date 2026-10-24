/**
 * The `tools/list` check — every rejection it is supposed to perform.
 *
 * This was `scripts/mcp-tools-probe.ts` (`pnpm probe:mcp-tools`) until
 * `scripts/` had a test runner: a `*.test.ts` here was a test nothing ran. It
 * is a test now, so the cases run on every push instead of when somebody
 * remembers.
 *
 * The gate's previous check was `/"tools"\s*:/` against the child's output.
 * Every case below that starts from an error envelope, a reply to a different
 * request, or a truncated line is a case that old check **passed**, while the
 * summary said the server had exposed its tools. Only the first case is
 * supposed to pass, and the rest are supposed to say what is wrong.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { McpToolListing } from './mcp-tools.js';
import { registeredToolNames, toolSurfaceProblems, toolsFromResponse } from './mcp-tools.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const AUDIT = 'audit_github_repository';
const FREE = 'free_check';
const QUALITY = 'quality_status';

/** What the cases below claim the source registers. */
const DECLARED = [AUDIT, FREE, QUALITY];

/** A tool the way the server writes one: a name, a sentence, and a schema. */
function tool(name: string): Record<string, unknown> {
  return {
    name,
    description: `${name} does the thing its name says.`,
    inputSchema: { type: 'object', properties: {} },
  };
}

/** A `tools/list` reply carrying `tools`. */
function reply(tools: unknown[], id: number | string = 2): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result: { tools } });
}

/**
 * Parse a reply that must parse.
 *
 * `expect(parsed).not.toBeNull()` reads well and narrows nothing — the
 * compiler still sees `McpToolListing[] | null` on the next line, which is how
 * this file first failed its typecheck. The helper both asserts and narrows.
 */
function parsedOrThrow(text: string): McpToolListing[] {
  const parsed = toolsFromResponse(text);
  if (parsed === null) throw new Error('expected the reply to parse');
  return parsed;
}

describe('toolsFromResponse', () => {
  it('parses a real reply, and matches the registrations', () => {
    const parsed = parsedOrThrow(reply([tool(AUDIT), tool(FREE), tool(QUALITY)]));
    expect(toolSurfaceProblems(parsed, DECLARED)).toEqual([]);
  });

  it('rejects an error envelope that mentions "tools"', () => {
    // The old check's most likely false pass: the server answers an error, and
    // the error's own text contains the word.
    expect(
      toolsFromResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'no tools loaded' } }),
      ),
    ).toBeNull();
  });

  it('rejects a reply carrying tools under a different id', () => {
    // The other false pass: a reply to `initialize` that happens to carry a
    // `tools` key. The id is what identifies the answer.
    expect(toolsFromResponse(reply([tool(AUDIT), tool(FREE), tool(QUALITY)], 1))).toBeNull();
  });

  it('rejects a line truncated by the capture cap', () => {
    // What a capture cap smaller than the payload produces: the front of the
    // single line is gone, so the tail cannot be parsed either.
    const full = reply([tool(AUDIT), tool(FREE), tool(QUALITY)]);
    expect(toolsFromResponse(full.slice(0, full.length - 40))).toBeNull();
  });

  it('names a tool that is declared but missing from the reply', () => {
    const parsed = parsedOrThrow(reply([tool(AUDIT), tool(FREE)]));
    expect(toolSurfaceProblems(parsed, DECLARED).join('\n')).toContain(
      `declared but not listed: ${QUALITY}`,
    );
  });

  it('names a tool the source does not register', () => {
    const parsed = parsedOrThrow(
      reply([tool(AUDIT), tool(FREE), tool(QUALITY), tool('shadow_tool')]),
    );
    expect(toolSurfaceProblems(parsed, DECLARED).join('\n')).toContain(
      'listed but not declared: shadow_tool',
    );
  });

  it('names a duplicate once', () => {
    const parsed = parsedOrThrow(
      reply([tool(AUDIT), tool(FREE), tool(QUALITY), tool(FREE)]),
    );
    expect(toolSurfaceProblems(parsed, DECLARED).join('\n')).toContain(
      `duplicate tool name(s): ${FREE}`,
    );
  });

  it('refuses a tool with no description', () => {
    // Listed and unusable: a client sees the name and nothing to call it with.
    const parsed = parsedOrThrow(
      reply([tool(AUDIT), { name: FREE, inputSchema: { type: 'object' } }, tool(QUALITY)]),
    );
    expect(toolSurfaceProblems(parsed, DECLARED).join('\n')).toContain(
      `listed without a description or an object inputSchema: ${FREE}`,
    );
  });

  it('refuses a tool whose schema is not an object', () => {
    const parsed = parsedOrThrow(
      reply([
        tool(AUDIT),
        tool(FREE),
        { name: QUALITY, description: 'Looks fine.', inputSchema: { type: 'string' } },
      ]),
    );
    expect(toolSurfaceProblems(parsed, DECLARED).join('\n')).toContain(
      `listed without a description or an object inputSchema: ${QUALITY}`,
    );
  });
});

describe('registeredToolNames', () => {
  it('reads the declared tools from index.ts, and throws rather than returning nothing', () => {
    // The reader half: the declared list comes from the source, and a pattern
    // that stopped matching must throw rather than compare against an empty
    // list — which would make every "declared but not listed" check pass.
    const declared = registeredToolNames(REPO);
    expect(declared.length).toBeGreaterThanOrEqual(5);
    expect(declared).toContain(FREE);
    expect(new Set(declared).size).toBe(declared.length);
  });
});
