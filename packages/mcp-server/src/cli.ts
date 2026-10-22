#!/usr/bin/env node
/**
 * CLI entrypoint: `repopilot-mcp`. Reads environment, starts the server.
 *
 * The shebang is load-bearing. `package.json` declares this file as the
 * `repopilot-mcp` bin, and npm builds that shim by copying the file verbatim
 * when it carries no shebang — so without this line the copy is handed to the
 * shell, which reads `import` as a command and the first path inside the
 * comment below as another one. `tsc` preserves a shebang on line 1.
 *
 * Every decision about *what* to read from the environment lives in
 * `payment-env.ts`; this file only decides what to do when that throws.
 *
 * ## Two transports, one binary
 *
 * `REPOPILOT_MCP_TRANSPORT` selects `stdio` (the default, and what an agent
 * host expects when it spawns this) or `http` (`http.ts`). The default stays
 * stdio because that is what every existing client is configured for, and a
 * binary that changed its transport on upgrade would break them silently.
 *
 * Everything this file prints goes to **stderr**, including the HTTP startup
 * line: on the stdio transport, stdout *is* the JSON-RPC channel, and one
 * `console.log` of a friendly banner corrupts the stream. That rule is why
 * there is no `console.log` in this file at all.
 */
import { startHttpServer } from './http.js';
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

const options = {
  payment,
  githubToken: process.env['GITHUB_TOKEN'] || undefined,
  allowedHosts,
};

const transport = process.env['REPOPILOT_MCP_TRANSPORT'] ?? 'stdio';

if (transport === 'http') {
  // Loopback by default. `assertBindable` refuses a wider address while the
  // payment mode is `mock`, and the reason is in `http.ts`.
  const host = process.env['REPOPILOT_MCP_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REPOPILOT_MCP_PORT'] ?? '3333');
  const path = process.env['REPOPILOT_MCP_PATH'] ?? '/mcp';

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    // eslint-disable-next-line no-console
    console.error(`repopilot-mcp: REPOPILOT_MCP_PORT must be a port number (got "${port}")`);
    process.exit(1);
  }

  try {
    const running = await startHttpServer({ ...options, host, port, path });
    // eslint-disable-next-line no-console
    console.error(
      `repopilot-mcp: listening on http://${running.host}:${running.port}${path} ` +
        `(payment: ${payment.mode}; health at /health)`
    );
    const shutdown = async (): Promise<void> => {
      try {
        await running.close();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `repopilot-mcp failed to start: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
} else if (transport === 'stdio') {
  try {
    // Never resolves while the client is connected: the stdio transport is the
    // server loop. Top-level `await` is what keeps the process alive without a
    // dangling `.then()`.
    await startStdioServer(options);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('repopilot-mcp failed to start:', err);
    process.exit(1);
  }
} else {
  // eslint-disable-next-line no-console
  console.error(
    `repopilot-mcp: REPOPILOT_MCP_TRANSPORT must be "stdio" or "http" (got "${transport}")`
  );
  process.exit(1);
}
