import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { PaymentConfig } from '@repopilot/okx-adapter';
import type { FreeCheckSource } from '@repopilot/core';
import { assertBindable, HttpTransportError, startHttpServer, type RunningHttpServer } from './http.js';

const mockPayment: PaymentConfig = {
  mode: 'mock',
  okx: { recipientAddress: '', network: 'xlayer', x402Version: 2 },
  pricing: { audit: { amount: '0.02', currency: 'USDT' } },
};

const okxPayment: PaymentConfig = {
  mode: 'okx',
  okx: { recipientAddress: '0x1111111111111111111111111111111111111111', network: 'xlayer', x402Version: 2 },
  pricing: { audit: { amount: '0.02', currency: 'USDT' } },
};

/**
 * A tree, so `free_check` answers without touching the network.
 *
 * Both methods are required: `FreeCheckSource` is `{ metadata, tree }`, and a
 * stub that offers only the tree makes `freeCheck.run()` throw — which the tool
 * catches and returns as `repository_unavailable`. The first version of this
 * test did exactly that and passed, because it only asserted the payload was
 * non-empty. It asserts the payload now.
 */
const treeSource: FreeCheckSource = {
  async metadata() {
    return {
      owner: 'octocat',
      name: 'Hello-World',
      defaultBranch: 'master',
      license: 'MIT',
      lastUpdatedAt: null,
      visibility: 'public',
      archived: false,
      stars: 1,
      openIssues: 0,
      openPulls: 0,
      description: 'a fixture',
      primaryLanguage: 'TypeScript',
      url: 'https://github.com/octocat/Hello-World',
    };
  },
  async tree() {
    return ['README.md', 'LICENSE', 'package.json', 'src/index.ts'].map((path) => ({
      path,
      size: 10,
    }));
  },
};

const ALLOWED_HOSTS = ['github.com', 'raw.githubusercontent.com'];

const running: RunningHttpServer[] = [];
const clients: Client[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close().catch(() => undefined);
  for (const server of running.splice(0)) await server.close().catch(() => undefined);
});

async function start(overrides: Partial<Parameters<typeof startHttpServer>[0]> = {}) {
  const server = await startHttpServer({
    payment: mockPayment,
    allowedHosts: ALLOWED_HOSTS,
    freeCheckSource: treeSource,
    host: '127.0.0.1',
    port: 0,
    ...overrides,
  });
  running.push(server);
  return server;
}

async function connect(server: RunningHttpServer): Promise<Client> {
  const client = new Client({ name: 'http-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.port}/mcp`)
  );
  await client.connect(transport);
  clients.push(client);
  return client;
}

describe('the bind address is a payment decision', () => {
  it('refuses a reachable address while the payment rail is mock', () => {
    expect(() => assertBindable('0.0.0.0', mockPayment)).toThrow(HttpTransportError);
    expect(() => assertBindable('192.168.1.20', mockPayment)).toThrow(/PAYMENT_MODE=mock/);
  });

  it('allows loopback with mock, and any address with a real rail', () => {
    expect(() => assertBindable('127.0.0.1', mockPayment)).not.toThrow();
    expect(() => assertBindable('localhost', mockPayment)).not.toThrow();
    expect(() => assertBindable('::1', mockPayment)).not.toThrow();
    expect(() => assertBindable('0.0.0.0', okxPayment)).not.toThrow();
  });

  it('is enforced by the server, not only by the helper', async () => {
    await expect(
      startHttpServer({
        payment: mockPayment,
        allowedHosts: ALLOWED_HOSTS,
        host: '0.0.0.0',
        port: 0,
      })
    ).rejects.toThrow(/PAYMENT_MODE=mock/);
  });
});

describe('the HTTP transport', () => {
  it('answers /health without a session', async () => {
    const server = await start();
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['transport']).toBe('http');
    expect(body['sessions']).toBe(0);
    expect(body['paymentMode']).toBe('mock');
  });

  it('serves the same fourteen tools over a real MCP session', async () => {
    const server = await start();
    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(14);
    expect(tools.map((t) => t.name)).toContain('audit_github_repository');
  });

  it('keeps a session alive across calls, so a job created in one is readable in the next', async () => {
    const server = await start();
    const client = await connect(server);
    // `list_audit_history` reads the per-server `JobStore`. A stateless
    // transport would build a new server for this call and answer empty — and
    // would also have answered `job_not_found` to every follow-up on an audit.
    const result = await client.callTool({
      name: 'list_audit_history',
      arguments: { repo_url: 'https://github.com/octocat/Hello-World' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    expect(text).toContain('octocat/Hello-World');
    expect(server.sessions).toBe(1);
  });

  it('runs a tool that reads a repository, through the injected source', async () => {
    const server = await start();
    const client = await connect(server);
    const result = await client.callTool({
      name: 'free_check',
      arguments: { repo_url: 'https://github.com/octocat/Hello-World' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    // A non-empty payload is not evidence: the tool answers an upstream failure
    // with `repository_unavailable` and a 200. These two assertions are what
    // separate "the tool ran" from "the tool answered".
    expect(text).not.toContain('repository_unavailable');
    expect(text).toContain('has-readme');
  });

  it('drops the session when the client terminates it', async () => {
    const server = await start();
    const client = await connect(server);
    expect(server.sessions).toBe(1);
    // `close()` only drops the socket; `terminateSession()` is the DELETE the
    // spec defines, and it is the one the server can see.
    await (client.transport as StreamableHTTPClientTransport).terminateSession();
    clients.length = 0;
    await expect.poll(() => server.sessions, { timeout: 2000 }).toBe(0);
  });

  it('reclaims a session whose client vanished without a DELETE', async () => {
    // A killed process sends nothing. Without the idle sweep the map would
    // keep its server — and its `JobStore` — until the process exits, and
    // `maxSessions` would fill with sessions nobody can reach.
    const server = await start({ sessionIdleMs: 50 });
    await connect(server);
    expect(server.sessions).toBe(1);
    await expect.poll(() => server.sessions, { timeout: 3000 }).toBe(0);
  });

  it('answers 404 for a path it does not serve, and says where the endpoint is', async () => {
    const server = await start();
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp/typo`, { method: 'POST' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; hint: string };
    expect(body.error).toBe('not_found');
    expect(body.hint).toContain('/mcp');
  });

  it('rejects a request that names a session it does not have', async () => {
    const server = await start();
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'no-such-session' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.message).toContain('session not found');
  });

  it('rejects a body that is not JSON with a parse error, not a crash', async () => {
    const server = await start();
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it('refuses a new session past the cap rather than evicting a live one', async () => {
    const server = await start({ maxSessions: 1 });
    await connect(server);
    const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'second', version: '1.0.0' },
        },
      }),
    });
    expect(res.status).toBe(503);
    expect(server.sessions).toBe(1);
  });
});
