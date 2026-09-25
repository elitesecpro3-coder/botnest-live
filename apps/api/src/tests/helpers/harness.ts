/**
 * Test harness: runs the REAL createApp() wiring against an in-memory fake of Supabase (PostgREST)
 * and OpenAI. No test in this suite can reach the real network or the real database:
 * globalThis.fetch is replaced BEFORE any supabase-js client is created, and every request that the
 * fake does not recognise is recorded as `unexpected` (tests assert it stays empty).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Environment must be set before app modules are imported.
delete process.env.OPENAI_API_KEY; // embeddings client then fails fast locally instead of calling OpenAI
process.env.SUPABASE_URL = 'http://fake-supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-tests-only';
process.env.NODE_ENV = 'test';
delete process.env.RESEND_API_KEY;

export const TEST_ADMIN_KEY = 'test-admin-key-0123456789-abcdefghijklmnopqrstuvwxyz';

export type Row = Record<string, any>;

export class FakeBackend {
  bots = new Map<string, Row>();
  conversations: Row[] = [];
  messages: Row[] = [];
  leads: Row[] = [];
  /** Every mutating call that reached the "database". */
  writes: Array<{ table: string; method: string; body: any }> = [];
  openaiRequests: any[] = [];
  unexpected: string[] = [];

  addBot(overrides: Row = {}): Row {
    const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
    const bot: Row = {
      id,
      user_id: '22222222-2222-4222-8222-222222222222',
      business_name: 'Test Business',
      website: 'https://test.example',
      industry: 'Testing',
      description: 'A disposable synthetic test bot.',
      tone: 'friendly',
      welcome_message: 'Hello from the test bot',
      system_prompt: null,
      market: 'us',
      is_active: true,
      status: 'active',
      usage_count: 0,
      usage_limit: 500,
      allowed_domains: [],
      notification_email: null,
      booking_link: null,
      fallback_contact: null,
      lead_capture_enabled: true,
      ...overrides,
    };
    this.bots.set(id, bot);
    return bot;
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  private wantsSingleObject(init?: RequestInit): boolean {
    const accept = new Headers(init?.headers).get('accept') ?? '';
    return accept.includes('application/vnd.pgrst.object+json');
  }

  fetch = async (input: any, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const body = bodyText ? JSON.parse(bodyText) : undefined;

    // ── OpenAI ────────────────────────────────────────────────────────────────
    if (url.host === 'fake-openai.test') {
      this.openaiRequests.push(body);
      return this.json({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: body?.model ?? 'test',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'FAKE-REPLY' } }],
      });
    }

    // ── Supabase / PostgREST ─────────────────────────────────────────────────
    if (url.host === 'fake-supabase.test') {
      const path = url.pathname.replace('/rest/v1/', '');

      if (path === 'bots' && method === 'GET') {
        const idParam = url.searchParams.get('id');
        const id = idParam?.replace(/^eq\./, '');
        const bot = id ? this.bots.get(id) : undefined;
        if (!bot) {
          return this.json({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
        }
        return this.json(this.wantsSingleObject(init) ? bot : [bot]);
      }
      if (path === 'bots' && method === 'PATCH') {
        this.writes.push({ table: 'bots', method, body });
        return new Response(null, { status: 204 });
      }
      if (path === 'bots' && method === 'POST') {
        this.writes.push({ table: 'bots', method, body });
        const bot = { id: body.id ?? 'generated-bot-id', ...body };
        this.bots.set(bot.id, bot);
        return this.json(bot, 201);
      }
      if (path === 'tools' && method === 'POST') {
        this.writes.push({ table: 'tools', method, body });
        return new Response(null, { status: 201 });
      }
      if (path === 'knowledge_items' && method === 'GET') {
        return this.json([]);
      }
      if (path === 'knowledge_items' && method === 'PATCH') {
        this.writes.push({ table: 'knowledge_items', method, body });
        return new Response(null, { status: 204 });
      }
      if (path === 'leads' && method === 'GET') {
        const botIdParam = url.searchParams.get('bot_id')?.replace(/^eq\./, '');
        const sinceParam = url.searchParams.get('created_at')?.replace(/^gte\./, '');
        const limitParam = Number(url.searchParams.get('limit') ?? '0') || undefined;
        let rows = this.leads.filter((l) => !botIdParam || l.bot_id === botIdParam);
        if (sinceParam) rows = rows.filter((l) => l.created_at >= sinceParam);
        rows = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first
        if (limitParam) rows = rows.slice(0, limitParam);
        return this.json(rows);
      }
      if (path === 'leads' && method === 'PATCH') {
        const idParam = url.searchParams.get('id')?.replace(/^eq\./, '');
        const lead = this.leads.find((l) => l.id === idParam);
        if (!lead) return this.json({ message: 'no rows found' }, 406);
        Object.assign(lead, body);
        this.writes.push({ table: 'leads', method, body });
        return this.json(this.wantsSingleObject(init) ? lead : [lead]);
      }
      if (path === 'leads' && method === 'POST') {
        this.writes.push({ table: 'leads', method, body });
        const lead = { id: `lead-${this.leads.length + 1}`, created_at: new Date().toISOString(), ...body };
        this.leads.push(lead);
        return this.json(this.wantsSingleObject(init) ? lead : [lead], 201);
      }
      if (path === 'messages' && method === 'POST') {
        this.writes.push({ table: 'messages', method, body });
        this.messages.push(body);
        return new Response(null, { status: 201 });
      }
      if (path === 'rpc/upsert_conversation') {
        this.writes.push({ table: 'conversations', method, body });
        const conv = { id: 'conv-1', bot_id: body.p_bot_id, session_id: body.p_session_id, status: 'active', turn_count: 0 };
        this.conversations.push(conv);
        return this.json(conv);
      }
      if (path === 'rpc/get_recent_messages') {
        return this.json(this.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })));
      }
      if (path === 'rpc/increment_conversation_turns') return new Response(null, { status: 204 });
      if (path === 'rpc/search_knowledge') return this.json([]);
    }

    this.unexpected.push(`${method} ${url.host}${url.pathname}`);
    throw new Error(`FakeBackend: unexpected request ${method} ${url.href}`);
  };
}

export const backend = new FakeBackend();
export const realFetch = globalThis.fetch;
globalThis.fetch = backend.fetch as typeof fetch;

// ── App + HTTP helpers ────────────────────────────────────────────────────────

export type ServerHandle = { server: http.Server; port: number; close: () => Promise<void> };

export async function startApp(rateLimits: Record<string, number> = {}): Promise<ServerHandle> {
  // Imported lazily so the fake fetch and env vars above are in place first.
  const OpenAI = require('openai').default;
  const { createApp } = require('../../app');
  const openai = new OpenAI({ apiKey: 'test-key', baseURL: 'http://fake-openai.test/v1', fetch: backend.fetch });
  const app = createApp({
    openai,
    // High default ceilings so each test only trips the limiter it targets.
    rateLimits: {
      generalPerMinute: 10_000,
      chatPerMinute: 10_000,
      chatPerHour: 10_000,
      chatPerBotPerMinute: 10_000,
      leadPerTenMinutes: 10_000,
      leadPerBotPerHour: 10_000,
      adminPerMinute: 10_000,
      adminFailuresPer15Minutes: 10_000,
      ...rateLimits,
    },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

export type Reply = { status: number; headers: http.IncomingHttpHeaders; json: any; text: string };

export function call(
  handle: ServerHandle,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: handle.port,
        method,
        path,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any;
          try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json, text });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Capture console output so tests can assert secrets are never logged. */
export function captureConsole() {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  console.log = grab;
  console.warn = grab;
  console.error = grab;
  return {
    lines,
    restore() {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}
