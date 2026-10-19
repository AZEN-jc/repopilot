#!/usr/bin/env node
/**
 * CLI entrypoint: `repopilot-mcp`. Reads environment, starts the stdio server.
 *
 * The shebang is load-bearing. `package.json` declares this file as the
 * `repopilot-mcp` bin, and npm builds that shim by copying the file verbatim
 * when it carries no shebang — so without this line the copy is handed to the
 * shell, which reads `import` as a command and the first path inside the
 * comment below as another one. `tsc` preserves a shebang on line 1.
 *
 * Every decision about *what* to read from the environment lives in
 * `payment-env.ts`; this file only decides what to do when that throws.
 */
import { startStdioServer } from './index.js';
import { paymentFromEnv, PaymentEnvError } from './payment-env.js';

let payment;
try {
  payment = paymentFromEnv(process.env);
} catch (err) {
  if (!(err instanceof PaymentEnvError)) throw err;
  // Refuse to start rather than start wrong. A misconfigured server that says
  // so at startup costs an operator a minute; one that starts anyway costs a
  // buyer a payment.
  // eslint-disable-next-line no-console
  console.error(`repopilot-mcp: ${err.message}`);
  process.exit(1);
}

const allowedHosts = (process.env['ALLOWED_REPO_HOSTS'] ?? 'github.com,raw.githubusercontent.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

startStdioServer({
  payment,
  githubToken: process.env['GITHUB_TOKEN'] || undefined,
  allowedHosts,
  // eslint-disable-next-line repopilot/no-floating-promise
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('repopilot-mcp failed to start:', err);
  process.exit(1);
});
