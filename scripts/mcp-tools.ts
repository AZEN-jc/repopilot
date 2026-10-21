/**
 * scripts/mcp-tools.ts — read an MCP `tools/list` answer and check it against
 * the registrations in the source.
 *
 * ## Why this is a module and not ten lines inside the gate
 *
 * `verify:release`'s MCP step is the only thing in this repository that checks
 * the **shipped binary** rather than the library a unit test imports, and for a
 * long time it checked the wrong thing: it waited for the word `"tools"` in the
 * child's output. Anything containing that word passed — an error envelope, a
 * log line, a reply to a different request. The gate proved the binary had
 * printed something; the summary claimed it had exposed its tools; nothing
 * compared the two.
 *
 * The replacement parses the reply and compares it to the `server.tool()`
 * registrations. That comparison is worth having only if it can be exercised
 * against answers that are *not* the happy path, and a check buried in a script
 * can only be exercised by starting a server and running thirteen other steps
 * first — which is why it never was. Here it is a function over a string, and
 * `scripts/mcp-tools-probe.ts` feeds it a real reply, an error envelope, a
 * truncated line, a removed tool, an extra tool and a tool with no description.
 *
 * ## What it does not know
 *
 * Nothing about this repository's layout: the root is passed in. The one
 * assumption is the shape of a `server.tool('name', …)` call, and a pattern
 * that stops matching throws rather than returning a short list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One tool as `tools/list` reports it, narrowed to the fields a caller reads.
 *
 * Every field is `unknown` on purpose: this parses a **process's output**, not
 * a value the type system has seen, so the checks have to run before anything
 * is trusted as a string.
 */
export interface McpToolListing {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
}

interface JsonRpcReply {
  id?: unknown;
  result?: { tools?: unknown };
}

/**
 * The JSON-RPC id `verify:release` sends with its `tools/list` request.
 *
 * The reply is identified by this id rather than by position, because the
 * `initialize` reply travels on the same stream and its ordering is not
 * something the server promises.
 */
export const TOOLS_LIST_REQUEST_ID = 2;

/**
 * The `tools/list` result out of a child's output, or `null` while it is not
 * there yet.
 *
 * A line that does not parse is skipped rather than fatal: it is a write that
 * has not finished landing, which is the normal state on the first poll of a
 * server that is still starting.
 */
export function toolsFromResponse(output: string): McpToolListing[] | null {
  for (const line of output.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    let msg: JsonRpcReply;
    try {
      msg = JSON.parse(text) as JsonRpcReply;
    } catch {
      continue;
    }
    if (msg.id !== TOOLS_LIST_REQUEST_ID) continue;
    if (Array.isArray(msg.result?.tools)) return msg.result.tools as McpToolListing[];
  }
  return null;
}

/**
 * Everything wrong with `tools` relative to `declared`, as sentences a reader
 * can act on. Empty means the binary exposes what the source registers.
 *
 * All problems are collected rather than the first one thrown, because the
 * interesting failures are plural: a tool that was renamed shows up as one
 * missing and one extra, and seeing both is the diagnosis.
 */
export function toolSurfaceProblems(tools: McpToolListing[], declared: string[]): string[] {
  const problems: string[] = [];

  const names: string[] = [];
  for (const t of tools) {
    if (typeof t.name !== 'string' || !/^[a-z0-9_]+$/.test(t.name)) {
      problems.push(`an entry is not a tool name: ${JSON.stringify(t.name)}`);
      continue;
    }
    names.push(t.name);
  }

  const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (duplicates.length > 0) {
    problems.push(`duplicate tool name(s): ${duplicates.join(', ')}`);
  }

  const missing = declared.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !declared.includes(n));
  if (missing.length > 0) problems.push(`declared but not listed: ${missing.join(', ')}`);
  if (extra.length > 0) problems.push(`listed but not declared: ${extra.join(', ')}`);

  // A name is what a client can call; the description and the schema are what
  // it can decide from. A tool listed without them is advertised and unusable,
  // and `tools/list` is the only place a client learns either.
  const bare = tools.filter(
    (t) =>
      typeof t.description !== 'string' ||
      t.description.trim() === '' ||
      typeof t.inputSchema !== 'object' ||
      t.inputSchema === null ||
      (t.inputSchema as { type?: unknown }).type !== 'object',
  );
  if (bare.length > 0) {
    problems.push(
      `listed without a description or an object inputSchema: ${bare
        .map((t) => String(t.name))
        .join(', ')}`,
    );
  }

  return problems;
}

/**
 * The tools the source registers, read the way `scripts/docs-facts.ts` reads
 * them.
 *
 * The declaration is re-read from the file rather than imported from the
 * package the binary was built out of: importing it would compare a module to
 * itself. A pattern that finds fewer than five registrations is an error, not
 * an empty list — the failure this guard exists for is a regex that silently
 * stopped matching and made every comparison pass.
 */
export function registeredToolNames(repoRoot: string): string[] {
  const src = readFileSync(join(repoRoot, 'packages/mcp-server/src/index.ts'), 'utf8');
  const names = [...src.matchAll(/server\.tool\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1] as string);
  if (names.length < 5) {
    throw new Error(
      `found only ${names.length} server.tool() registrations in ` +
        'packages/mcp-server/src/index.ts. The registration pattern changed; fix this ' +
        'reader rather than trusting the result.',
    );
  }
  return names;
}
