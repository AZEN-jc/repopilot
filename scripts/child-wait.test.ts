/**
 * `waitForAnswer` — every branch, or the branches that are not covered
 * silently.
 *
 * This file used to be a hand-run probe (`scripts/child-wait-probe.ts`,
 * `pnpm probe:child-wait`) because `scripts/` had no test runner: the root is
 * not a workspace package, so `pnpm -r test` never looked here. It is a test
 * now, which means the five cases run on every push instead of when somebody
 * remembers.
 *
 * The cases are worth having because the shared wait is worth having *only* for
 * its failure branches — the happy path is four lines — and those are the
 * branches no gate exercised. `verify:release` proves the success path (three
 * `waitForApi` calls and one parsed `tools/list` reply); nothing proved that a
 * dead child still reports its exit code, or that the three messages had not
 * collapsed back into the one that named the wrong failure. A wait whose
 * branches have been merged reports the same thing in every case, and every
 * case still "works".
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { spawnChild, waitForAnswer, type SpawnedChild } from './child-wait.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A child that stays alive and says nothing. */
function silentChild(): SpawnedChild {
  return spawnChild('node', ['-e', 'setInterval(() => {}, 1000)'], { cwd: REPO, env: process.env });
}

describe('waitForAnswer', () => {
  it('names the exit code and the child output when the child dies first', async () => {
    // The defect that reached CI: a port clash printed `EADDRINUSE` and exited
    // with a code, and the wait reported a timeout because it never read the
    // pipe it had already been handed.
    const child = spawnChild('node', ['-e', "console.error('boom: EADDRINUSE'); process.exit(3)"], {
      cwd: REPO,
      env: process.env,
    });

    await expect(
      waitForAnswer(
        child,
        { label: 'api', what: 'http://127.0.0.1:1/health', timeoutMs: 10_000, envVar: 'X' },
        async () => null,
      ),
    ).rejects.toThrow(/exited before answering.*code=3.*boom: EADDRINUSE/s);
  });

  it('reports a child that cannot be spawned as such, not as a timeout', async () => {
    const child = spawnChild('definitely-not-a-binary-xyz', [], { cwd: REPO, env: process.env });

    await expect(
      waitForAnswer(
        child,
        { label: 'api', what: 'http://127.0.0.1:1/health', timeoutMs: 10_000, envVar: 'X' },
        async () => null,
      ),
    ).rejects.toThrow(/could not be spawned at all.*ENOENT/s);
  });

  it('names the override in the budget message for a live, silent child', async () => {
    // "after 600ms" without "raise MY_TIMEOUT_MS" is a dead end; the first
    // attempt at this case used an 8 s override and reported a booting child
    // as alive-and-silent.
    await expect(
      waitForAnswer(
        silentChild(),
        { label: 'api', what: 'http://127.0.0.1:1/health', timeoutMs: 600, envVar: 'MY_TIMEOUT_MS' },
        async () => null,
      ),
    ).rejects.toThrow(/after 600ms.*raise MY_TIMEOUT_MS.*The process is still running/s);
  });

  it('returns an answer from the third probe instead of waiting the budget out', async () => {
    let probes = 0;
    const answer = await waitForAnswer(
      silentChild(),
      { label: 'api', what: 'the third probe', timeoutMs: 10_000, envVar: 'X' },
      async () => {
        probes += 1;
        return probes === 3 ? `answered on probe ${probes}` : null;
      },
    );
    expect(answer).toBe('answered on probe 3');
  });

  it('treats a child that answers and then exits as success, not death', async () => {
    // The regression that reached CI: a stdio server answers and *then* exits,
    // so an exited child with the answer already in the buffer is success.
    const child = spawnChild('node', ['-e', "console.log('\"tools\": []'); process.exit(0)"], {
      cwd: REPO,
      env: process.env,
    });
    // The exit is not instantaneous; give it the head start the old case gave
    // it, so the wait really does meet a child that has already exited.
    await new Promise((r) => setTimeout(r, 300));

    const out = await waitForAnswer(
      child,
      { label: 'mcp', what: 'tools/list', timeoutMs: 5_000, envVar: 'X' },
      async () => (child.output().includes('"tools"') ? child.output() : null),
    );
    expect(out).toContain('"tools"');
  });
});
