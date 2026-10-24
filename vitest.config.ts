/**
 * The root's own test runner — for `scripts/`.
 *
 * `pnpm -r test` walks the workspace packages, and the root is not one of
 * them, so a `*.test.ts` beside a script was a test nothing ran (R-31's shape,
 * one directory over). This config is that directory's runner, and it exists
 * on its own rather than inside a workspace package because the alternative —
 * moving every shared helper into a package — would make `scripts/` a
 * directory with no rules of its own and lose the one property that makes it
 * useful: the gates live next to the code they gate.
 *
 * `pnpm test` runs both legs, so one command and one transcript.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
