import './helpers/harness';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { backend, call, captureConsole, ServerHandle, startApp, TEST_ADMIN_KEY } from './helpers/harness';
import { buildEmbedScript } from '../routes/onboard';

const BOT = '11111111-1111-4111-8111-111111111111';
const WRONG_KEY = 'wrong-key-wrong-key-wrong-key-wrong-key-12345';

let app: ServerHandle;
let logs: ReturnType<typeof captureConsole>;

before(async () => {
  logs = captureConsole();
  process.env.BOTNEST_ADMIN_API_KEY = TEST_ADMIN_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_never_used';
  process.env.FRONTEND_ORIGINS = 'https://bot-nest.com';
  backend.addBot({ id: BOT });
  app = await startApp();
});

after(async () => {
  await app.close();
  logs.restore();
});

beforeEach(() => {
  backend.writes.length = 0;
  backend.unexpected.length = 0;
  process.env.BOTNEST_ADMIN_API_KEY = TEST_ADMIN_KEY;
});

// Every management route, with a body that is rejected by validation (400) once authenticated,
// so "authenticated" requests in this suite never write anything.
const ADMIN_ROUTES: Array<[string, string, unknown]> = [
  ['GET', `/api/knowledge/${BOT}`, undefined],
  ['POST', '/api/knowledge', {}],
  ['POST', '/api/knowledge/bulk', {}],
  ['POST', '/api/knowledge/search', {}],
  ['DELETE', '/api/knowledge/some-item-id', undefined],
  ['POST', '/api/onboard', {}],
  ['POST', '/api/createBot', {}],
  ['POST', '/api/create-bot', {}],
  ['POST', '/api/createbot', {}], // Express routing is case-insensitive; the guard must be too
];

describe('G. admin routes without a key', () => {
  for (const [method, path, body] of ADMIN_ROUTES) {
    it(`${method} ${path} -> 401 and touches nothing`, async () => {
      const r = await call(app, method, path, { body });
      assert.equal(r.status, 401);
      assert.equal(r.json.error, 'unauthorized');
      assert.deepEqual(backend.writes, []);
      assert.deepEqual(backend.unexpected, []);
    });
  }

  it('a key in the query string is NOT accepted (it would leak into logs)', async () => {
    const r = await call(app, 'GET', `/api/knowledge/${BOT}?key=${TEST_ADMIN_KEY}`);
    assert.equal(r.status, 401);
  });

  it('an empty header is treated as missing', async () => {
    const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': '' } });
    assert.equal(r.status, 401);
  });
});

describe('H. admin routes with an incorrect key', () => {
  for (const [method, path, body] of ADMIN_ROUTES) {
    it(`${method} ${path} -> 401`, async () => {
      const r = await call(app, method, path, { body, headers: { 'x-admin-key': WRONG_KEY } });
      assert.equal(r.status, 401);
      assert.deepEqual(backend.writes, []);
    });
  }

  it('near-miss keys (prefix, suffix, case change, embedded space) are rejected', async () => {
    // Leading/trailing whitespace is not tested: HTTP strips it from header values before the server sees it.
    for (const bad of [TEST_ADMIN_KEY.slice(0, -1), `${TEST_ADMIN_KEY}x`, TEST_ADMIN_KEY.toUpperCase(), `${TEST_ADMIN_KEY.slice(0, 5)} ${TEST_ADMIN_KEY.slice(5)}`]) {
      const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': bad } });
      assert.equal(r.status, 401, bad);
    }
  });

  it('a wrong Bearer token is rejected', async () => {
    const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { authorization: `Bearer ${WRONG_KEY}` } });
    assert.equal(r.status, 401);
  });
});

describe('I. admin routes with the correct key', () => {
  it('reaches every management handler (validation responses prove the handler ran)', async () => {
    for (const [method, path, body] of ADMIN_ROUTES) {
      if (method === 'GET' || method === 'DELETE') continue;
      const r = await call(app, method, path, { body, headers: { 'x-admin-key': TEST_ADMIN_KEY } });
      assert.equal(r.status, 400, `${method} ${path}`);
    }
  });

  it('GET knowledge list and DELETE knowledge item work with the key (fake backend)', async () => {
    const list = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.items, []);
    const del = await call(app, 'DELETE', '/api/knowledge/some-item-id', { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
    assert.equal(del.status, 200);
  });

  it('accepts the key as a Bearer token too', async () => {
    const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { authorization: `Bearer ${TEST_ADMIN_KEY}` } });
    assert.equal(r.status, 200);
  });

  it('is fail-closed: with no server key configured, even a matching header is refused (503)', async () => {
    delete process.env.BOTNEST_ADMIN_API_KEY;
    const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error, 'admin_api_not_configured');
    const empty = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': '' } });
    assert.notEqual(empty.status, 200);
  });

  it('is fail-closed for a weak (short) server key', async () => {
    process.env.BOTNEST_ADMIN_API_KEY = 'short';
    const r = await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': 'short' } });
    assert.equal(r.status, 503);
  });

  it('never logs the admin key or an attempted key', async () => {
    logs.lines.length = 0;
    await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': WRONG_KEY } });
    await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
    delete process.env.BOTNEST_ADMIN_API_KEY;
    await call(app, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
    const joined = logs.lines.join('\n');
    assert.ok(!joined.includes(TEST_ADMIN_KEY), 'admin key leaked to logs');
    assert.ok(!joined.includes(WRONG_KEY), 'attempted key leaked to logs');
  });
});

describe('Public widget routes never require the admin key', () => {
  it('config works with the admin key configured and with it absent', async () => {
    assert.equal((await call(app, 'GET', `/api/config/${BOT}`)).status, 200);
    delete process.env.BOTNEST_ADMIN_API_KEY;
    assert.equal((await call(app, 'GET', `/api/config/${BOT}`)).status, 200);
    assert.equal((await call(app, 'POST', '/api/lead', { body: { botId: BOT, name: 'Synthetic', phone: '5551234567' } })).status, 200);
    assert.equal((await call(app, 'POST', '/api/chat', { body: { botId: BOT, message: 'hi' } })).status, 200);
    assert.equal((await call(app, 'GET', '/api/health')).status, 200);
  });
});

describe('create-checkout-session: only admins may target an existing bot', () => {
  it('botId without a key -> 401 (before any Stripe call)', async () => {
    const r = await call(app, 'POST', '/api/create-checkout-session', { body: { botId: BOT, plan: 'pro' } });
    assert.equal(r.status, 401);
    assert.deepEqual(backend.unexpected, []);
  });

  it('botId with a wrong key -> 401', async () => {
    const r = await call(app, 'POST', '/api/create-checkout-session', {
      body: { botId: BOT, plan: 'pro' },
      headers: { 'x-admin-key': WRONG_KEY },
    });
    assert.equal(r.status, 401);
  });

  it('the public flow (no botId) does not need a key and proceeds to normal validation', async () => {
    const r = await call(app, 'POST', '/api/create-checkout-session', { body: { plan: 'bogus', business_name: 'x', website: 'y' } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /plan must be starter or pro/);
  });

  it('botId with the correct key passes authentication', async () => {
    const r = await call(app, 'POST', '/api/create-checkout-session', {
      body: { botId: BOT, plan: 'bogus' },
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /plan must be starter or pro/);
  });
});

describe('Admin rate limiting', () => {
  it('locks out an IP after repeated FAILED attempts, but not other IPs and not successful use', async () => {
    const limited = await startApp({ adminFailuresPer15Minutes: 3 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push((await call(limited, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': WRONG_KEY } })).status);
      }
      assert.deepEqual(statuses, [401, 401, 401, 429]);

      const sameIpCorrectKey = await call(limited, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
      assert.equal(sameIpCorrectKey.status, 429, 'brute-force lockout applies to the offending IP');

      const otherIp = await call(limited, 'GET', `/api/knowledge/${BOT}`, {
        headers: { 'x-admin-key': TEST_ADMIN_KEY, 'x-forwarded-for': '203.0.113.50' },
      });
      assert.equal(otherIp.status, 200);
    } finally {
      await limited.close();
    }
  });

  it('successful requests do not consume the failure budget', async () => {
    const limited = await startApp({ adminFailuresPer15Minutes: 2 });
    try {
      for (let i = 0; i < 6; i++) {
        const r = await call(limited, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } });
        assert.equal(r.status, 200, `request ${i}`);
      }
    } finally {
      await limited.close();
    }
  });

  it('caps the overall admin request rate per IP', async () => {
    const limited = await startApp({ adminPerMinute: 2 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await call(limited, 'GET', `/api/knowledge/${BOT}`, { headers: { 'x-admin-key': TEST_ADMIN_KEY } })).status);
      }
      assert.deepEqual(statuses, [200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('K. generated embed snippet and onboarding domain lock', () => {
  it('buildEmbedScript points at https://bot-nest.com/widget.js, not the API host', () => {
    const snippet = buildEmbedScript('00000000-0000-0000-0000-000000000000', 'https://api.bot-nest.com');
    assert.ok(snippet.includes('src="https://bot-nest.com/widget.js"'));
    assert.ok(snippet.includes('data-bot-id="00000000-0000-0000-0000-000000000000"'));
    assert.ok(snippet.includes('data-api-url="https://api.bot-nest.com"'));
    assert.ok(!snippet.includes('api.bot-nest.com/widget.js'));
  });

  it('WIDGET_JS_URL can override the script host', () => {
    process.env.WIDGET_JS_URL = 'https://cdn.example/widget.js';
    try {
      assert.ok(buildEmbedScript('id', 'https://api.example').includes('src="https://cdn.example/widget.js"'));
    } finally {
      delete process.env.WIDGET_JS_URL;
    }
  });

  it('POST /api/onboard (admin) returns the corrected snippet and stores a normalized allowed_domains', async () => {
    const r = await call(app, 'POST', '/api/onboard', {
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: { businessName: 'Synthetic Onboard Test', allowedDomains: ['Rubio.Example', 'https://www.rubio.example/path?x=1', 'rubio.example'] },
    });
    assert.equal(r.status, 201);
    assert.ok(r.json.embedScript.includes('https://bot-nest.com/widget.js'));
    assert.ok(!r.json.embedScript.includes('api.bot-nest.com/widget.js'));
    assert.deepEqual(r.json.allowedDomains, ['rubio.example', 'www.rubio.example']);
    const botInsert = backend.writes.find((w) => w.table === 'bots' && w.method === 'POST');
    assert.deepEqual(botInsert?.body.allowed_domains, ['rubio.example', 'www.rubio.example']);
  });

  it('onboarding without allowedDomains does not send the column (works before the migration is applied)', async () => {
    const r = await call(app, 'POST', '/api/onboard', {
      headers: { 'x-admin-key': TEST_ADMIN_KEY },
      body: { businessName: 'Synthetic Legacy Onboard' },
    });
    assert.equal(r.status, 201);
    const botInsert = backend.writes.find((w) => w.table === 'bots' && w.method === 'POST');
    assert.ok(botInsert && !('allowed_domains' in botInsert.body));
  });

  it('rejects invalid allowedDomains instead of silently leaving the bot unrestricted', async () => {
    for (const allowedDomains of [['*.com'], ['not a host'], 'rubio.example', [5]]) {
      backend.writes.length = 0;
      const r = await call(app, 'POST', '/api/onboard', {
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
        body: { businessName: 'Synthetic Invalid', allowedDomains },
      });
      assert.equal(r.status, 400, JSON.stringify(allowedDomains));
      assert.deepEqual(backend.writes, []);
    }
  });
});
