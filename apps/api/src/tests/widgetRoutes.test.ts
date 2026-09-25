import './helpers/harness';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { backend, call, captureConsole, ServerHandle, startApp } from './helpers/harness';
import { buildDynamicPrompt, sanitizeSystemPrompt } from '../routes/chat';

process.env.FRONTEND_ORIGINS = 'https://bot-nest.com';

const LEGACY = '11111111-1111-4111-8111-111111111111';
const RESTRICTED = '33333333-3333-4333-8333-333333333333';
const RESTRICTED_INACTIVE = '44444444-4444-4444-8444-444444444444';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

const GOOD = 'https://rubio.example';
const EVIL = 'https://evil.example';

const chatBody = (botId: string, extra: Record<string, unknown> = {}) => ({ botId, message: 'hello', ...extra });
const leadBody = (botId: string) => ({ botId, name: 'Synthetic Tester', phone: '5551234567' });

let app: ServerHandle;
let logs: ReturnType<typeof captureConsole>;

before(async () => {
  logs = captureConsole();
  backend.addBot({ id: LEGACY, allowed_domains: [] });
  backend.addBot({ id: RESTRICTED, allowed_domains: ['rubio.example', 'www.rubio.example'] });
  backend.addBot({ id: RESTRICTED_INACTIVE, allowed_domains: ['rubio.example'], is_active: false });
  app = await startApp();
});

after(async () => {
  await app.close();
  logs.restore();
});

beforeEach(() => {
  backend.writes.length = 0;
  backend.openaiRequests.length = 0;
  backend.unexpected.length = 0;
  // Every test's leadBody() uses the same phone number — without resetting this, lead-dedupe
  // (see createOrUpdateLead) would treat one test's lead as a duplicate of a previous test's.
  backend.leads.length = 0;
});

describe('Migration-order safety: widget_theme / branding columns applied independently', () => {
  // FakeBackend.addBot()'s base row has no widget_theme/show_powered_by/powered_by_text/
  // powered_by_url properties at all — the same shape a real row has before either migration is
  // applied (a missing column, not a null one, since select('*') simply omits it).
  it('neither migration applied: config has no theme/poweredBy keys, does not crash', async () => {
    const id = 'd0000000-0000-4000-8000-000000000001';
    backend.addBot({ id });
    const r = await call(app, 'GET', `/api/config/${id}`);
    assert.equal(r.status, 200);
    assert.ok(!('theme' in r.json), 'no widget_theme column yet — theme key must be absent');
    assert.ok(!('poweredBy' in r.json), 'no branding columns yet — poweredBy key must be absent');
  });

  it('only the widget_theme migration applied: theme works, branding is still absent/off', async () => {
    const id = 'd0000000-0000-4000-8000-000000000002';
    backend.addBot({ id, widget_theme: { primary: '#0B1F3B' } }); // show_powered_by etc. intentionally not set
    const r = await call(app, 'GET', `/api/config/${id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.theme, { primary: '#0b1f3b' });
    assert.ok(!('poweredBy' in r.json));
  });

  it('only the branding migration applied: branding works, theme is still absent', async () => {
    const id = 'd0000000-0000-4000-8000-000000000003';
    backend.addBot({ id, show_powered_by: true }); // widget_theme intentionally not set
    const r = await call(app, 'GET', `/api/config/${id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.poweredBy, { text: 'Powered by BotNest', url: 'https://bot-nest.com' });
    assert.ok(!('theme' in r.json));
  });

  it('both migrations applied: both features work together', async () => {
    const id = 'd0000000-0000-4000-8000-000000000004';
    backend.addBot({ id, widget_theme: { accent: '#0071E3' }, show_powered_by: true, powered_by_text: 'Built with BotNest' });
    const r = await call(app, 'GET', `/api/config/${id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.theme, { accent: '#0071e3' });
    assert.deepEqual(r.json.poweredBy, { text: 'Built with BotNest', url: 'https://bot-nest.com' });
  });
});

describe('A. legacy bot (allowed_domains = {}) keeps working without any admin credential', () => {
  it('config / chat / lead work with no Origin', async () => {
    const config = await call(app, 'GET', `/api/config/${LEGACY}`);
    assert.equal(config.status, 200);
    assert.equal(config.json.welcomeMessage, 'Hello from the test bot');
    assert.ok(!('allowed_domains' in config.json) && !('allowedDomains' in config.json), 'config must not expose domains');
    assert.ok(!('theme' in config.json) && !('poweredBy' in config.json), 'pre-migration/legacy bot must not expose theme or branding keys');

    const chat = await call(app, 'POST', '/api/chat', { body: chatBody(LEGACY) });
    assert.equal(chat.status, 200);
    assert.equal(chat.json.reply, 'FAKE-REPLY');

    const lead = await call(app, 'POST', '/api/lead', { body: leadBody(LEGACY) });
    assert.equal(lead.status, 200);
    assert.equal(lead.json.success, true);
    assert.equal(backend.writes.filter((w) => w.table === 'leads').length, 1);
    assert.deepEqual(backend.unexpected, []);
  });

  it('the bot-nest.com origin gets CORS headers', async () => {
    const config = await call(app, 'GET', `/api/config/${LEGACY}`, { headers: { origin: 'https://bot-nest.com' } });
    assert.equal(config.status, 200);
    assert.equal(config.headers['access-control-allow-origin'], 'https://bot-nest.com');
    const chat = await call(app, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { origin: 'https://bot-nest.com' } });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers['access-control-allow-origin'], 'https://bot-nest.com');
  });

  it('a foreign origin is still blocked for legacy bots (as before) and nothing is written', async () => {
    for (const [method, path, body] of [
      ['GET', `/api/config/${LEGACY}`, undefined],
      ['POST', '/api/chat', chatBody(LEGACY)],
      ['POST', '/api/lead', leadBody(LEGACY)],
    ] as const) {
      const r = await call(app, method, path, { body, headers: { origin: EVIL } });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.headers['access-control-allow-origin'], undefined);
    }
    assert.deepEqual(backend.writes, []);
    assert.deepEqual(backend.openaiRequests, []);
  });

  it('unknown bot ids keep the demo behavior, and can be switched off', async () => {
    assert.equal((await call(app, 'GET', `/api/config/${UNKNOWN}`)).json.botId, 'demo');
    assert.equal((await call(app, 'POST', '/api/chat', { body: chatBody(UNKNOWN) })).status, 200);
    assert.equal((await call(app, 'POST', '/api/lead', { body: leadBody(UNKNOWN) })).status, 404);

    process.env.BOTNEST_DISABLE_DEMO_CHAT = 'true';
    try {
      backend.openaiRequests.length = 0;
      assert.equal((await call(app, 'POST', '/api/chat', { body: chatBody(UNKNOWN) })).status, 404);
      assert.deepEqual(backend.openaiRequests, []);
    } finally {
      delete process.env.BOTNEST_DISABLE_DEMO_CHAT;
    }
  });
});

describe('B. restricted bot with a permitted domain', () => {
  it('config / chat / lead succeed and echo the origin for CORS', async () => {
    const headers = { origin: GOOD };
    const config = await call(app, 'GET', `/api/config/${RESTRICTED}`, { headers });
    assert.equal(config.status, 200);
    assert.equal(config.headers['access-control-allow-origin'], GOOD);
    assert.equal(config.headers.vary?.includes('Origin'), true);

    const chat = await call(app, 'POST', '/api/chat', { body: chatBody(RESTRICTED), headers });
    assert.equal(chat.status, 200);
    assert.equal(chat.json.reply, 'FAKE-REPLY');
    assert.equal(chat.headers['access-control-allow-origin'], GOOD);
    assert.equal(backend.openaiRequests.length, 1);

    const lead = await call(app, 'POST', '/api/lead', { body: leadBody(RESTRICTED), headers });
    assert.equal(lead.status, 200);
    assert.equal(backend.writes.filter((w) => w.table === 'leads').length, 1);
    assert.deepEqual(backend.unexpected, []);
  });

  it('www variant works because it is explicitly listed', async () => {
    const r = await call(app, 'GET', `/api/config/${RESTRICTED}`, { headers: { origin: 'https://www.rubio.example' } });
    assert.equal(r.status, 200);
  });

  it('a session-bound chat (conversation memory) works for the permitted domain', async () => {
    const r = await call(app, 'POST', '/api/chat', { body: chatBody(RESTRICTED, { sessionId: 'sess-1' }), headers: { origin: GOOD } });
    assert.equal(r.status, 200);
    assert.ok(backend.writes.some((w) => w.table === 'conversations'));
    assert.ok(backend.writes.some((w) => w.table === 'messages'));
  });
});

describe('C. restricted bot with a forbidden domain', () => {
  it('rejects config / chat / lead with 403, no CORS headers, and performs no writes or OpenAI calls', async () => {
    const headers = { origin: EVIL };
    for (const [method, path, body] of [
      ['GET', `/api/config/${RESTRICTED}`, undefined],
      ['POST', '/api/chat', chatBody(RESTRICTED, { sessionId: 'sess-evil' })],
      ['POST', '/api/lead', leadBody(RESTRICTED)],
    ] as const) {
      const r = await call(app, method, path, { body, headers });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.json.error, 'domain_not_allowed');
      assert.equal(r.headers['access-control-allow-origin'], undefined);
    }
    assert.deepEqual(backend.writes, [], 'no conversation/message/lead/usage write may happen for a denied origin');
    assert.deepEqual(backend.openaiRequests, []);
  });

  it('lookalike and subdomain origins are rejected', async () => {
    for (const origin of ['https://rubio.example.evil.example', 'https://evilrubio.example', 'https://shop.rubio.example', 'http://rubio.example']) {
      const r = await call(app, 'GET', `/api/config/${RESTRICTED}`, { headers: { origin } });
      assert.equal(r.status, 403, origin);
    }
  });

  it('does not reveal that a restricted bot is inactive to a foreign origin', async () => {
    const foreign = await call(app, 'GET', `/api/config/${RESTRICTED_INACTIVE}`, { headers: { origin: EVIL } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.json.error, 'domain_not_allowed');
    const legit = await call(app, 'GET', `/api/config/${RESTRICTED_INACTIVE}`, { headers: { origin: GOOD } });
    assert.equal(legit.status, 403);
    assert.equal(legit.json.error, 'inactive');
  });
});

describe('D. restricted bot with no Origin / Referer', () => {
  it('rejects requests with neither header on all three endpoints', async () => {
    assert.equal((await call(app, 'GET', `/api/config/${RESTRICTED}`)).status, 403);
    assert.equal((await call(app, 'POST', '/api/chat', { body: chatBody(RESTRICTED) })).status, 403);
    assert.equal((await call(app, 'POST', '/api/lead', { body: leadBody(RESTRICTED) })).status, 403);
    assert.deepEqual(backend.writes, []);
    assert.deepEqual(backend.openaiRequests, []);
  });

  it('rejects Origin: null even with an allowed Referer', async () => {
    const r = await call(app, 'POST', '/api/chat', { body: chatBody(RESTRICTED), headers: { origin: 'null', referer: `${GOOD}/page` } });
    assert.equal(r.status, 403);
  });

  it('accepts an allowed Referer only when Origin is absent, and rejects a foreign Referer', async () => {
    const ok = await call(app, 'GET', `/api/config/${RESTRICTED}`, { headers: { referer: `${GOOD}/contact?x=1` } });
    assert.equal(ok.status, 200);
    const bad = await call(app, 'GET', `/api/config/${RESTRICTED}`, { headers: { referer: `${EVIL}/${GOOD}` } });
    assert.equal(bad.status, 403);
  });
});

describe('Widget-specific CORS', () => {
  it('preflight on widget routes reflects the origin without knowing the bot; the real request decides', async () => {
    const pre = await call(app, 'OPTIONS', '/api/chat', {
      headers: { origin: EVIL, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers['access-control-allow-origin'], EVIL);
    assert.match(String(pre.headers['access-control-allow-methods']), /POST/);
    assert.equal(pre.headers['access-control-allow-headers'], 'Content-Type');
    assert.deepEqual(backend.writes, []);
  });

  it('non-widget routes still use the strict global FRONTEND_ORIGINS list', async () => {
    const blocked = await call(app, 'GET', '/api/health', { headers: { origin: EVIL } });
    assert.equal(blocked.status, 500);
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
    const allowed = await call(app, 'GET', '/api/health', { headers: { origin: 'https://bot-nest.com' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://bot-nest.com');
    const preflightBlocked = await call(app, 'OPTIONS', '/api/knowledge', {
      headers: { origin: EVIL, 'access-control-request-method': 'POST' },
    });
    assert.notEqual(preflightBlocked.status, 204);
    assert.equal(preflightBlocked.headers['access-control-allow-origin'], undefined);
  });
});

describe('E. chat rate limiting', () => {
  it('limits per IP per minute, keeps other IPs working, and never reaches OpenAI once limited', async () => {
    const limited = await startApp({ chatPerMinute: 3 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push((await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { origin: 'https://bot-nest.com' } })).status);
      }
      assert.deepEqual(statuses, [200, 200, 200, 429]);
      assert.equal(backend.openaiRequests.length, 3, 'the 4th request must not spend OpenAI tokens');

      const again = await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { origin: 'https://bot-nest.com' } });
      assert.equal(again.status, 429);
      assert.equal(again.headers['access-control-allow-origin'], 'https://bot-nest.com', '429 must be readable by the widget');
      assert.ok(again.headers['retry-after'] || again.headers['ratelimit'] || again.headers['ratelimit-reset']);

      const otherIp = await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { 'x-forwarded-for': '203.0.113.7' } });
      assert.equal(otherIp.status, 200);
    } finally {
      await limited.close();
    }
  });

  it('limits per IP per hour', async () => {
    const limited = await startApp({ chatPerHour: 2 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) statuses.push((await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY) })).status);
      assert.deepEqual(statuses, [200, 200, 429]);
    } finally {
      await limited.close();
    }
  });

  it('limits a single bot across all visitors, without affecting other bots', async () => {
    const limited = await startApp({ chatPerBotPerMinute: 2 });
    try {
      const a = await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { 'x-forwarded-for': '198.51.100.1' } });
      const b = await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { 'x-forwarded-for': '198.51.100.2' } });
      const c = await call(limited, 'POST', '/api/chat', { body: chatBody(LEGACY), headers: { 'x-forwarded-for': '198.51.100.3' } });
      assert.deepEqual([a.status, b.status, c.status], [200, 200, 429]);
      const other = await call(limited, 'POST', '/api/chat', { body: chatBody(RESTRICTED), headers: { origin: GOOD, 'x-forwarded-for': '198.51.100.4' } });
      assert.equal(other.status, 200);
    } finally {
      await limited.close();
    }
  });
});

describe('F. lead rate limiting', () => {
  it('limits lead submissions per IP and stops writing leads once limited', async () => {
    const limited = await startApp({ leadPerTenMinutes: 2 });
    try {
      backend.writes.length = 0;
      const results: Array<{ status: number; duplicate?: boolean }> = [];
      for (let i = 0; i < 3; i++) {
        const r = await call(limited, 'POST', '/api/lead', { body: leadBody(LEGACY) });
        results.push({ status: r.status, duplicate: r.json?.duplicate });
      }
      assert.deepEqual(results.map((r) => r.status), [200, 200, 429]);
      // Both allowed submissions use the identical synthetic name/phone, so the 2nd is a lead-dedupe
      // match (see leadDedupe.test.ts) — it merges into the 1st instead of writing a new row.
      assert.equal(results[0].duplicate, false);
      assert.equal(results[1].duplicate, true);
      assert.equal(backend.writes.filter((w) => w.table === 'leads').length, 1);
    } finally {
      await limited.close();
    }
  });

  it('limits lead submissions per bot across IPs', async () => {
    const limited = await startApp({ leadPerBotPerHour: 2 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await call(limited, 'POST', '/api/lead', { body: leadBody(LEGACY), headers: { 'x-forwarded-for': `192.0.2.${i + 1}` } })).status);
      }
      assert.deepEqual(statuses, [200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('Input caps (OpenAI cost protection)', () => {
  it('truncates an oversized message and bounds client-supplied history', async () => {
    const history = Array.from({ length: 50 }, (_v, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const r = await call(app, 'POST', '/api/chat', {
      body: chatBody(LEGACY, { message: 'x'.repeat(10_000), messages: history }),
    });
    assert.equal(r.status, 200);
    const sent = backend.openaiRequests[0].messages.filter((m: any) => m.role !== 'system');
    assert.equal(sent.length, 20);

    backend.openaiRequests.length = 0;
    const r2 = await call(app, 'POST', '/api/chat', { body: chatBody(LEGACY, { message: 'y'.repeat(10_000) }) });
    assert.equal(r2.status, 200);
    const sent2 = backend.openaiRequests[0].messages.filter((m: any) => m.role === 'user');
    assert.equal(sent2[0].content.length, 4000);
  });

  it('rejects a lead with oversized fields', async () => {
    const r = await call(app, 'POST', '/api/lead', { body: { botId: LEGACY, name: 'n'.repeat(500), phone: '5551234567' } });
    assert.equal(r.status, 400);
    assert.deepEqual(backend.writes, []);
  });
});

describe('J. system_prompt reaches the chat model call', () => {
  const systemMessages = () => backend.openaiRequests[0].messages.filter((m: any) => m.role === 'system');

  it('appends a bot system_prompt to the single system message', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    backend.addBot({ id, system_prompt: 'GUARDRAIL: Only discuss doctor-appointment rides. MARK-J1' });
    const r = await call(app, 'POST', '/api/chat', { body: chatBody(id) });
    assert.equal(r.status, 200);

    const sys = systemMessages();
    assert.equal(sys.length, 1, 'exactly one system message');
    assert.ok(sys[0].content.includes('MARK-J1'));
    assert.ok(sys[0].content.includes('BUSINESS-SPECIFIC INSTRUCTIONS'));
    assert.ok(sys[0].content.includes('TOOL USAGE'), 'existing tool rules are preserved');
    assert.ok(sys[0].content.indexOf('TOOL USAGE') < sys[0].content.indexOf('MARK-J1'), 'business block comes after the core rules');
    assert.ok(sys[0].content.includes('Test Business'));
  });

  it('legacy bots (null system_prompt) get exactly the previous prompt', async () => {
    const r = await call(app, 'POST', '/api/chat', { body: chatBody(LEGACY) });
    assert.equal(r.status, 200);
    assert.ok(!systemMessages()[0].content.includes('BUSINESS-SPECIFIC INSTRUCTIONS'));
    assert.equal(systemMessages()[0].content, buildDynamicPrompt('Test Business', 'Testing', 'A disposable synthetic test bot.', 'us'));
  });

  it('malformed values never break chat', async () => {
    let n = 0;
    for (const bad of ['   ', '\u0000\u0001', 42, { evil: true }, ['a'], true]) {
      const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++n).padStart(12, '0')}`;
      backend.addBot({ id, system_prompt: bad });
      backend.openaiRequests.length = 0;
      const r = await call(app, 'POST', '/api/chat', { body: chatBody(id) });
      assert.equal(r.status, 200, `system_prompt=${JSON.stringify(bad)}`);
      assert.ok(!systemMessages()[0].content.includes('BUSINESS-SPECIFIC INSTRUCTIONS'));
    }
  });

  it('caps an oversized system_prompt and strips control characters', () => {
    assert.equal(sanitizeSystemPrompt('a'.repeat(20_000))!.length, 8000);
    assert.equal(sanitizeSystemPrompt('ok\u0000\u0007text\n'), 'oktext');
    assert.equal(sanitizeSystemPrompt('line1\nline2\tx'), 'line1\nline2\tx');
    assert.equal(sanitizeSystemPrompt(null), undefined);
    assert.equal(sanitizeSystemPrompt(undefined), undefined);
  });

  it("BotNest's own promotional bot keeps its dedicated prompt (system_prompt is not applied to it)", async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    backend.addBot({ id, business_name: 'BotNest AI Assistant', system_prompt: 'MARK-OWN-BOT' });
    const r = await call(app, 'POST', '/api/chat', { body: chatBody(id) });
    assert.equal(r.status, 200);
    assert.ok(!systemMessages()[0].content.includes('MARK-OWN-BOT'));
    assert.ok(systemMessages()[0].content.includes('BotNest AI sales consultant'));
  });
});

describe('Logging hygiene', () => {
  it('denied-origin logs contain the bot id and reason but never message content', async () => {
    logs.lines.length = 0;
    await call(app, 'POST', '/api/chat', { body: chatBody(RESTRICTED, { message: 'SECRET-VISITOR-TEXT' }), headers: { origin: EVIL } });
    const joined = logs.lines.join('\n');
    assert.ok(joined.includes('[origin-policy] denied'));
    assert.ok(joined.includes('origin_not_allowed'));
    assert.ok(!joined.includes('SECRET-VISITOR-TEXT'));
  });
});
