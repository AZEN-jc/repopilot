/**
 * HTTP transport for the MCP server.
 *
 * The stdio transport is the one an agent host launches; this one is for the
 * deployments where the host cannot spawn a child process — a hosted agent, a
 * browser-based client, a colleague pointing their editor at a URL. It speaks
 * **Streamable HTTP** (`POST /mcp` for client→server messages, `GET /mcp` for
 * the server→client SSE stream, `DELETE /mcp` to end a session), not the older
 * `SSEServerTransport`.
 *
 * The BACKLOG entry that asked for this said "SSE", and that was the name of
 * the transport when the entry was written. It is not any more: SSE-only is the
 * deprecated half, and a client that speaks Streamable HTTP cannot talk to it.
 * The SDK ships both, so the choice was free — and taking the deprecated one
 * would have meant writing the integration a second time when it goes.
 *
 * ## Sessions are stateful on purpose
 *
 * `buildMcpServer` owns an in-memory `JobStore`, and three tools read it:
 * `get_audit_status`, `list_audit_history` and every report tool that takes a
 * `job_id`. A stateless transport (a fresh server per request) would answer
 * `job_not_found` to the second call of every audit — the first call creates
 * the job, the second call arrives at a different server. So one server is
 * built per MCP session and kept until the client deletes the session or the
 * transport closes.
 *
 * That is a memory cost, and it is bounded: `maxSessions` refuses new sessions
 * past the cap with a 503 rather than growing until the process dies. The cap
 * is a refusal, not an eviction — evicting a session would break a caller
 * mid-audit to protect a resource the caller can see is full.
 *
 * ## The bind address is a payment decision
 *
 * The paid tools run the pipeline for free when `PAYMENT_MODE=mock`, because
 * mock mode auto-verifies the challenge it just minted. On stdio that is
 * harmless — the only caller is the process that launched it. On a socket it is
 * R-02's shape exactly: anyone who can reach the port gets paid audits for
 * nothing, with no log line. `assertBindable` therefore refuses a non-loopback
 * address with mock payment, and the default is loopback. An operator who wants
 * to expose it sets `PAYMENT_MODE=okx` — which is the configuration that has a
 * real payment handshake behind it.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaymentConfig } from '@repopilot/okx-adapter';
import { buildMcpServer, type McpServerOptions } from './index.js';

/** The most a single JSON-RPC request may weigh. A tool call is small. */
const MAX_BODY_BYTES = 1_000_000;

/** Addresses that cannot be reached from another host. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

export class HttpTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpTransportError';
  }
}

export interface HttpServerOptions extends McpServerOptions {
  port: number;
  /** Bind address. Loopback unless the operator says otherwise. */
  host: string;
  /** The path the transport answers on. `/mcp` by default. */
  path?: string;
  /** Concurrent sessions allowed. Refused past this, never evicted. */
  maxSessions?: number;
  /**
   * How long a session may go without a request before it is closed.
   *
   * A client that disappears does not always send `DELETE`: a killed process,
   * a closed laptop, a dropped network. Without this the map would keep a
   * server — and its `JobStore` — for the life of the process, so `maxSessions`
   * would eventually fill with sessions nobody can reach. Ten minutes by
   * default; a sweep, not a per-request check, so an idle server reclaims too.
   */
  sessionIdleMs?: number;
}

export interface RunningHttpServer {
  readonly port: number;
  readonly host: string;
  /** Live sessions, for `/health` and for tests. */
  readonly sessions: number;
  close(): Promise<void>;
}

/**
 * Refuse a socket the payment mode cannot back.
 *
 * Exported because it is the security rule, and a rule that is only reachable
 * through `startHttpServer` is a rule no test can state directly.
 */
export function assertBindable(host: string, payment: PaymentConfig): void {
  if (payment.mode !== 'mock') return;
  if (LOOPBACK.has(host)) return;
  throw new HttpTransportError(
    `refusing to bind ${host} with PAYMENT_MODE=mock — the mock rail treats any ` +
      'non-empty payment as proof, so every paid tool would be free to anyone who can ' +
      'reach the port. Bind 127.0.0.1, or set PAYMENT_MODE=okx with OKX_PAYMENT_ADDRESS.'
  );
}

interface Session {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  /** Last time a request named this session. Drives the idle sweep. */
  lastSeen: number;
}

export async function startHttpServer(opts: HttpServerOptions): Promise<RunningHttpServer> {
  assertBindable(opts.host, opts.payment);

  const path = opts.path ?? '/mcp';
  const maxSessions = opts.maxSessions ?? 64;
  const sessionIdleMs = opts.sessionIdleMs ?? 600_000;
  const sessions = new Map<string, Session>();

  const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  /** A JSON-RPC error envelope, so a client parses it as a protocol reply. */
  const sendRpcError = (res: ServerResponse, status: number, code: number, message: string): void => {
    sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
  };

  const readBody = async (req: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > MAX_BODY_BYTES) throw new HttpTransportError('request body too large');
      chunks.push(buf);
    }
    if (size === 0) return undefined;
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new HttpTransportError('request body is not JSON');
    }
  };

  const createSession = async (): Promise<Session> => {
    if (sessions.size >= maxSessions) {
      throw new HttpTransportError(
        `session limit reached (${maxSessions}); close a session with DELETE ${path}`
      );
    }
    const { server } = buildMcpServer(opts);
    // Assigned before `server.connect()` below, which is the first moment
    // `onsessioninitialized` can fire — so the callback never sees `undefined`.
    let session: Session | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        if (session !== undefined) sessions.set(id, session);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    session = { server, transport, lastSeen: Date.now() };
    // The client may close the socket without a DELETE; the map must not keep
    // a server nobody can reach. `onsessionclosed` is the polite path, this is
    // the one that fires when the polite path is not taken.
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined) sessions.delete(id);
    };
    await server.connect(transport);
    return session;
  };

  const sessionFor = (req: IncomingMessage): Session | undefined => {
    const id = req.headers['mcp-session-id'];
    if (typeof id !== 'string') return undefined;
    const session = sessions.get(id);
    if (session !== undefined) session.lastSeen = Date.now();
    return session;
  };

  /** Close something that may already be gone. A sweep is not an error path. */
  const closeQuietly = async (close: () => Promise<void>): Promise<void> => {
    try {
      await close();
    } catch {
      // Already closed, or the socket went away first. Nothing to report: the
      // session is being reclaimed precisely because nobody is listening.
    }
  };

  /** Close the sessions no client has touched within `sessionIdleMs`. */
  const sweep = (): void => {
    const cutoff = Date.now() - sessionIdleMs;
    for (const [id, session] of [...sessions]) {
      if (session.lastSeen > cutoff) continue;
      sessions.delete(id);
      void closeQuietly(() => session.transport.close());
      void closeQuietly(() => session.server.close());
    }
  };
  // Unref'd: a background sweep must not be the reason the process stays up.
  const sweeper = setInterval(sweep, Math.min(sessionIdleMs, 60_000));
  sweeper.unref();

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/health') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      sendJson(res, 200, {
        status: 'ok',
        transport: 'http',
        path,
        sessions: sessions.size,
        maxSessions,
        paymentMode: opts.payment.mode,
      });
      return;
    }

    if (url.pathname !== path) {
      sendJson(res, 404, { error: 'not_found', hint: `the MCP endpoint is ${path}` });
      return;
    }

    if (req.method === 'POST') {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (err) {
        sendRpcError(res, 400, -32700, err instanceof Error ? err.message : 'bad request');
        return;
      }

      // A POST without a session header is an `initialize`; anything else must
      // name the session it belongs to, or it would land in a server that has
      // never seen its job.
      const existing = sessionFor(req);
      if (existing === undefined && req.headers['mcp-session-id'] !== undefined) {
        sendRpcError(res, 404, -32001, 'session not found');
        return;
      }

      try {
        const session = existing ?? (await createSession());
        await session.transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          const message = err instanceof Error ? err.message : 'internal error';
          const status = err instanceof HttpTransportError ? 503 : 500;
          sendRpcError(res, status, -32603, message);
        }
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      const session = sessionFor(req);
      if (session === undefined) {
        sendRpcError(res, 400, -32000, 'missing or unknown mcp-session-id');
        return;
      }
      try {
        await session.transport.handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          sendRpcError(res, 500, -32603, err instanceof Error ? err.message : 'internal error');
        }
      }
      return;
    }

    res.writeHead(405, { allow: 'GET, POST, DELETE' });
    res.end();
  };

  /** `handle` with the catch the socket needs: an unhandled rejection here
   *  would take the process down for one malformed request. */
  const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      await handle(req, res);
    } catch (err) {
      if (!res.headersSent) {
        sendRpcError(res, 500, -32603, err instanceof Error ? err.message : 'internal error');
      }
    }
  };

  const httpServer: Server = createServer((req, res) => {
    void serve(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(opts.port, opts.host);
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : opts.port;

  return {
    port,
    host: opts.host,
    get sessions() {
      return sessions.size;
    },
    async close() {
      clearInterval(sweeper);
      // Close the sessions first: a transport with an open SSE stream keeps the
      // socket alive, and `httpServer.close()` waits for it. Closing in the
      // other order hangs until the client disconnects, which for a test is
      // never.
      for (const session of [...sessions.values()]) {
        await session.transport.close();
        await session.server.close();
      }
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
