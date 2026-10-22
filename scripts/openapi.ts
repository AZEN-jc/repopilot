#!/usr/bin/env tsx
/**
 * scripts/openapi.ts — publish the API contract as a file.
 *
 * Why a file, when `GET /docs/openapi.json` already serves one
 * -----------------------------------------------------------
 * The endpoint answers the same question, and it answers it only for someone
 * who is already running the service. The consumers that need the contract
 * before that — an SDK author, a client generator, a reviewer asking what
 * changed between two releases — had to start Fastify, sqlite and the queue to
 * read a document that is a pure function of the source. So the same function
 * that serves the endpoint also writes `docs/openapi.json`, and the file is
 * checked in.
 *
 * What makes the checked-in copy safe
 * -----------------------------------
 * A generated file in version control rots the moment someone edits the
 * source and forgets to regenerate. `--check` is the answer: it rebuilds the
 * document in memory and byte-compares it with the file on disk, so a stale
 * copy fails CI rather than misleading a reader. `pnpm docs:check` does the
 * same job for prose facts; this is the same gate for the contract.
 *
 *   pnpm openapi:build   rewrite docs/openapi.json
 *   pnpm openapi:check   rebuild and compare; exit 1 on any difference
 *   pnpm openapi         print the document to stdout
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiSpec } from '../apps/api/src/openapi.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TARGET = resolve(REPO, 'docs/openapi.json');

function render(): string {
  // Two spaces and a trailing newline: the file is meant to be read and
  // diffed by humans, and `git diff` on a single line of minified JSON is
  // not a review.
  return JSON.stringify(buildOpenApiSpec(), null, 2) + '\n';
}

function main(argv: string[]): number {
  const mode = argv.includes('--write') ? 'write' : argv.includes('--check') ? 'check' : 'print';
  const rendered = render();

  if (mode === 'print') {
    process.stdout.write(rendered);
    return 0;
  }

  if (mode === 'write') {
    writeFileSync(TARGET, rendered, 'utf8');
    console.log(`openapi: wrote ${TARGET} (${rendered.length} bytes)`);
    return 0;
  }

  if (!existsSync(TARGET)) {
    console.error(
      `openapi:check: ${TARGET} does not exist. Run \`pnpm openapi:build\` and commit the result.`,
    );
    return 1;
  }
  const onDisk = readFileSync(TARGET, 'utf8');
  if (onDisk === rendered) {
    console.log(`openapi:check: ${TARGET} matches the source`);
    return 0;
  }
  // Say *where* it diverges, not just that it does. "The file is stale" sends
  // the reader to regenerate and move on; the line number sends them to the
  // change that made it stale, which is the thing worth reviewing.
  const a = onDisk.split('\n');
  const b = rendered.split('\n');
  let line = 0;
  while (line < a.length && line < b.length && a[line] === b[line]) line += 1;
  console.error(
    `openapi:check: ${TARGET} is stale — it differs from the source at line ${line + 1}.\n` +
      `  file:   ${JSON.stringify((a[line] ?? '<end of file>').slice(0, 160))}\n` +
      `  source: ${JSON.stringify((b[line] ?? '<end of file>').slice(0, 160))}\n` +
      'Run `pnpm openapi:build` and commit the result.',
  );
  return 1;
}

process.exit(main(process.argv.slice(2)));
