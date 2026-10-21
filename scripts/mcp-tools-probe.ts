#!/usr/bin/env tsx
/**
 * scripts/mcp-tools-probe.ts — prove that the `tools/list` check rejects the
 * answers it is supposed to reject.
 *
 * ## Why this is not a test in a test runner
 *
 * `scripts/` has no test harness: `pnpm -r test` walks the workspace packages
 * and the root is not one of them, so a `*.test.ts` here would be a test
 * nothing runs — the same shape `child-wait-probe.ts` documents one directory
 * over. This is a probe you run by hand, which asserts and exits non-zero.
 *
 * ## What it is for
 *
 * The gate's previous check was `/"tools"\s*:/` against the child's output.
 * Every case below that starts from an error envelope, a reply to a different
 * request, or a truncated line is a case that old check **passed**, while the
 * summary said the server had exposed its tools. Only the first case is
 * supposed to pass, and the rest are supposed to say what is wrong.
 *
 * Usage: `pnpm probe:mcp-tools` — exits 0 when every case behaves, 1 with the
 * diff otherwise. No network, no child process, no build.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registeredToolNames, toolSurfaceProblems, toolsFromResponse } from './mcp-tools.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const AUDIT = 'audit_github_repository';
const FREE = 'free_check';
const QUALITY = 'quality_status';

/** What the three cases below claim the source registers. */
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

interface Case {
  name: string;
  /** What the parse must return. */
  parse: 'found' | 'not found';
  /**
   * For a parsed reply: substrings the problems must contain. Empty means the
   * reply must produce no problems at all.
   */
  problems?: string[];
  run: () => ReturnType<typeof toolsFromResponse>;
}

const CASES: Case[] = [
  {
    name: 'a real reply parses, and matches the registrations',
    parse: 'found',
    problems: [],
    run: () => toolsFromResponse(reply([tool(AUDIT), tool(FREE), tool(QUALITY)])),
  },
  {
    // The old check's most likely false pass: the server answers an error, and
    // the error's own text contains the word.
    name: 'an error envelope that mentions "tools" is not a tool list',
    parse: 'not found',
    run: () =>
      toolsFromResponse(
        JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'no tools loaded' } }),
      ),
  },
  {
    // The other false pass: a reply to `initialize` that happens to carry a
    // `tools` key. The id is what identifies the answer.
    name: 'a reply carrying tools under a different id is not the answer',
    parse: 'not found',
    run: () => toolsFromResponse(reply([tool(AUDIT), tool(FREE), tool(QUALITY)], 1)),
  },
  {
    // What a capture cap smaller than the payload produces: the front of the
    // single line is gone, so the tail cannot be parsed either.
    name: 'a line truncated by the capture cap is not a tool list',
    parse: 'not found',
    run: () => {
      const full = reply([tool(AUDIT), tool(FREE), tool(QUALITY)]);
      return toolsFromResponse(full.slice(0, full.length - 40));
    },
  },
  {
    name: 'a tool missing from the reply is named',
    parse: 'found',
    problems: [`declared but not listed: ${QUALITY}`],
    run: () => toolsFromResponse(reply([tool(AUDIT), tool(FREE)])),
  },
  {
    name: 'a tool the source does not register is named',
    parse: 'found',
    problems: ['listed but not declared: shadow_tool'],
    run: () => toolsFromResponse(reply([tool(AUDIT), tool(FREE), tool(QUALITY), tool('shadow_tool')])),
  },
  {
    name: 'a duplicate name is named once',
    parse: 'found',
    problems: [`duplicate tool name(s): ${FREE}`],
    run: () => toolsFromResponse(reply([tool(AUDIT), tool(FREE), tool(QUALITY), tool(FREE)])),
  },
  {
    // Listed and unusable: a client sees the name and nothing to call it with.
    name: 'a tool with no description is refused',
    parse: 'found',
    problems: [`listed without a description or an object inputSchema: ${FREE}`],
    run: () =>
      toolsFromResponse(
        reply([tool(AUDIT), { name: FREE, inputSchema: { type: 'object' } }, tool(QUALITY)]),
      ),
  },
  {
    name: 'a tool whose schema is not an object is refused',
    parse: 'found',
    problems: [`listed without a description or an object inputSchema: ${QUALITY}`],
    run: () =>
      toolsFromResponse(
        reply([
          tool(AUDIT),
          tool(FREE),
          { name: QUALITY, description: 'Looks fine.', inputSchema: { type: 'string' } },
        ]),
      ),
  },
];

let failed = 0;

function report(name: string, problems: string[]): void {
  if (problems.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    return;
  }
  failed += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  for (const p of problems) console.log(`      ${p}`);
}

for (const c of CASES) {
  const problems: string[] = [];
  const parsed = c.run();

  if (c.parse === 'found' && parsed === null) problems.push('it did not parse, and it should have');
  if (c.parse === 'not found' && parsed !== null) problems.push('it parsed, and it should not have');

  if (parsed !== null) {
    const found = toolSurfaceProblems(parsed, DECLARED);
    const expected = c.problems ?? [];
    if (expected.length === 0) {
      if (found.length > 0) problems.push(`expected no problems; got ${JSON.stringify(found)}`);
    } else {
      for (const needle of expected) {
        if (!found.some((p) => p.includes(needle))) {
          problems.push(`no problem mentions ${JSON.stringify(needle)}; got ${JSON.stringify(found)}`);
        }
      }
    }
  }

  report(c.name, problems);
}

// The reader half: the declared list comes from the source, and a pattern that
// stopped matching must throw rather than compare against an empty list.
{
  const problems: string[] = [];
  try {
    const declared = registeredToolNames(REPO);
    if (declared.length < 5) problems.push(`only ${declared.length} registrations found`);
    if (!declared.includes(FREE)) problems.push(`${FREE} is not among the registrations`);
    if (new Set(declared).size !== declared.length) problems.push('the registrations contain a duplicate');
    if (problems.length === 0) {
      report(`the source declares ${declared.length} tools, read from index.ts`, []);
    }
  } catch (e) {
    problems.push((e as Error).message);
  }
  if (problems.length > 0) report('reading the declared tools from index.ts', problems);
}

if (failed > 0) {
  console.log(`\n  ${failed} case(s) did not behave`);
  process.exit(1);
}
console.log(`\n  \x1b[32mall ${CASES.length + 1} cases behave\x1b[0m`);
process.exit(0);
