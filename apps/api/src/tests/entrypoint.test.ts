import './helpers/harness';

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

/**
 * Exercises the real Vercel entrypoint (apps/api/api/index.ts), which lazily builds the same
 * createApp() used everywhere else, plus the legacy /widget.js redirect.
 */
describe('Vercel entrypoint (api/index.ts)', () => {
  let server: http.Server;
  let port: number;

  before(async () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-used'; // the entrypoint constructs a real OpenAI client; no chat call is made here
    delete process.env.BOTNEST_ADMIN_API_KEY;
    const handler = require('../../api/index');
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    delete process.env.OPENAI_API_KEY;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = (path: string) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }).on('error', reject);
    });

  it('serves /api/health', async () => {
    const r = await get('/api/health');
    assert.equal(r.status, 200);
    assert.match(r.body, /ok/);
  });

  it('redirects the old api.bot-nest.com/widget.js URL to the real widget location', async () => {
    const r = await get('/widget.js');
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, 'https://bot-nest.com/widget.js');
  });

  it('management routes are closed (503) when BOTNEST_ADMIN_API_KEY is not configured', async () => {
    const r = await get('/api/knowledge/00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 503);
  });
});
