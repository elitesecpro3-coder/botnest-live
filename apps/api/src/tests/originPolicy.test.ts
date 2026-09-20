import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkBotOrigin,
  hostMatchesEntry,
  isDomainRestricted,
  normalizeDomainEntry,
  normalizeDomainList,
  parseHost,
} from '../lib/originPolicy';

const restricted = (...domains: string[]) => ({ allowed_domains: domains });
const FRONTEND = ['https://bot-nest.com'];

describe('normalizeDomainEntry', () => {
  it('strips protocol, path, query, fragment and port; lowercases', () => {
    assert.equal(normalizeDomainEntry('https://Example.COM/some/path?x=1#frag'), 'example.com');
    assert.equal(normalizeDomainEntry('http://www.example.com:8080/'), 'www.example.com');
    assert.equal(normalizeDomainEntry('  EXAMPLE.com  '), 'example.com');
    assert.equal(normalizeDomainEntry('example.com:3000'), 'example.com');
    assert.equal(normalizeDomainEntry('example.com.'), 'example.com');
  });

  it('keeps apex and www as distinct entries (subdomains are never implied)', () => {
    assert.equal(normalizeDomainEntry('example.com'), 'example.com');
    assert.equal(normalizeDomainEntry('www.example.com'), 'www.example.com');
    assert.equal(hostMatchesEntry('www.example.com', 'example.com'), false);
    assert.equal(hostMatchesEntry('example.com', 'www.example.com'), false);
  });

  it('accepts explicit localhost, 127.0.0.1 and preview hosts', () => {
    assert.equal(normalizeDomainEntry('localhost'), 'localhost');
    assert.equal(normalizeDomainEntry('http://localhost:3000'), 'localhost');
    assert.equal(normalizeDomainEntry('127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeDomainEntry('preview-domain.vercel.app'), 'preview-domain.vercel.app');
  });

  it('supports explicit wildcards but rejects dangerous ones', () => {
    assert.equal(normalizeDomainEntry('*.example.com'), '*.example.com');
    assert.equal(normalizeDomainEntry('https://*.Example.com/x'), '*.example.com');
    assert.equal(normalizeDomainEntry('*.com'), null);
    assert.equal(normalizeDomainEntry('*.co.uk'), null);
    assert.equal(normalizeDomainEntry('*.vercel.app'), null);
    assert.equal(normalizeDomainEntry('*.wixsite.com'), null);
    assert.equal(normalizeDomainEntry('*.127.0.0.1'), null);
    assert.equal(normalizeDomainEntry('*.'), null);
  });

  it('rejects junk', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'ftp://example.com', 'exa mple.com', '..', 'a..b', null, undefined, 5, {}]) {
      assert.equal(normalizeDomainEntry(bad as unknown), null, `should reject ${String(bad)}`);
    }
  });

  it('normalizeDomainList de-duplicates and reports invalid entries', () => {
    const { valid, invalid } = normalizeDomainList(['Example.com', 'https://example.com/', 'www.example.com', '*.com', '']);
    assert.deepEqual(valid, ['example.com', 'www.example.com']);
    assert.equal(invalid.length, 2);
  });

  it('parseHost handles bare hosts and URLs', () => {
    assert.equal(parseHost('example.com/path'), 'example.com');
    assert.equal(parseHost('HTTPS://Sub.Example.com:444'), 'sub.example.com');
  });
});

describe('wildcard matching', () => {
  it('matches subdomains at any depth but not the apex or lookalikes', () => {
    assert.equal(hostMatchesEntry('a.example.com', '*.example.com'), true);
    assert.equal(hostMatchesEntry('a.b.example.com', '*.example.com'), true);
    assert.equal(hostMatchesEntry('example.com', '*.example.com'), false);
    assert.equal(hostMatchesEntry('evilexample.com', '*.example.com'), false);
    assert.equal(hostMatchesEntry('example.com.evil.com', '*.example.com'), false);
  });
});

describe('A. legacy bot (allowed_domains = {}) preserves current behavior', () => {
  it('is not restricted when empty, null or missing', () => {
    assert.equal(isDomainRestricted({ allowed_domains: [] }), false);
    assert.equal(isDomainRestricted({ allowed_domains: null }), false);
    assert.equal(isDomainRestricted({}), false);
    assert.equal(isDomainRestricted(null), false);
  });

  it('allows requests with no Origin (same as before)', () => {
    assert.equal(checkBotOrigin(restricted(), {}, FRONTEND).allowed, true);
  });

  it('allows an origin on the global FRONTEND_ORIGINS list, blocks others (same as before)', () => {
    assert.equal(checkBotOrigin(restricted(), { origin: 'https://bot-nest.com' }, FRONTEND).allowed, true);
    const denied = checkBotOrigin(restricted(), { origin: 'https://evil.example' }, FRONTEND);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'legacy_origin_not_allowed');
  });

  it('allows everything when FRONTEND_ORIGINS is unset (same as before)', () => {
    assert.equal(checkBotOrigin(restricted(), { origin: 'https://anything.example' }, []).allowed, true);
  });

  it('does not consult Referer for legacy bots', () => {
    assert.equal(checkBotOrigin(restricted(), { referer: 'https://evil.example/x' }, FRONTEND).allowed, true);
  });

  it('unknown/demo bots (null) follow the legacy rule', () => {
    assert.equal(checkBotOrigin(null, { origin: 'https://evil.example' }, FRONTEND).allowed, false);
    assert.equal(checkBotOrigin(null, {}, FRONTEND).allowed, true);
  });
});

describe('B. restricted bot, permitted domain', () => {
  const bot = restricted('rubio.example', 'www.rubio.example');

  it('allows exact hosts', () => {
    assert.equal(checkBotOrigin(bot, { origin: 'https://rubio.example' }, FRONTEND).allowed, true);
    assert.equal(checkBotOrigin(bot, { origin: 'https://www.rubio.example' }, FRONTEND).allowed, true);
  });

  it('is case-insensitive and ignores port', () => {
    assert.equal(checkBotOrigin(bot, { origin: 'https://RUBIO.example:443' }, FRONTEND).allowed, true);
  });

  it('does not depend on the global FRONTEND_ORIGINS list', () => {
    assert.equal(checkBotOrigin(bot, { origin: 'https://rubio.example' }, []).allowed, true);
    assert.equal(checkBotOrigin(bot, { origin: 'https://bot-nest.com' }, FRONTEND).allowed, false);
  });

  it('allows explicit wildcard subdomains only when configured', () => {
    assert.equal(checkBotOrigin(restricted('*.rubio.example'), { origin: 'https://shop.rubio.example' }).allowed, true);
    assert.equal(checkBotOrigin(restricted('*.rubio.example'), { origin: 'https://rubio.example' }).allowed, false);
  });
});

describe('C. restricted bot, forbidden domain', () => {
  const bot = restricted('rubio.example');

  it('denies other origins and lookalikes', () => {
    for (const origin of [
      'https://evil.example',
      'https://rubio.example.evil.example',
      'https://evilrubio.example',
      'https://www.rubio.example', // subdomain not implied
      'https://sub.rubio.example',
    ]) {
      const d = checkBotOrigin(bot, { origin }, FRONTEND);
      assert.equal(d.allowed, false, origin);
      assert.equal(d.reason, 'origin_not_allowed', origin);
    }
  });

  it('denies plain http for non-loopback hosts', () => {
    const d = checkBotOrigin(bot, { origin: 'http://rubio.example' }, FRONTEND);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'insecure_scheme');
  });

  it('a list containing only invalid entries fails closed (never degrades to legacy)', () => {
    const d = checkBotOrigin(restricted('*.com', 'not a host'), { origin: 'https://rubio.example' }, FRONTEND);
    assert.equal(d.allowed, false);
    assert.equal(d.mode, 'restricted');
  });
});

describe('D. restricted bot with no / bad Origin and Referer', () => {
  const bot = restricted('rubio.example');

  it('denies when neither Origin nor Referer is present', () => {
    const d = checkBotOrigin(bot, {}, FRONTEND);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'no_origin');
  });

  it('denies Origin: null and malformed Origin values, and does NOT fall back to Referer for them', () => {
    const nullOrigin = checkBotOrigin(bot, { origin: 'null', referer: 'https://rubio.example/page' }, FRONTEND);
    assert.equal(nullOrigin.allowed, false);
    assert.equal(nullOrigin.reason, 'null_origin');
    for (const origin of ['garbage', 'https://rubio.example/path', 'https://user@rubio.example', '']) {
      const d = checkBotOrigin(bot, { origin, referer: 'https://rubio.example/page' }, FRONTEND);
      assert.equal(d.allowed, false, `origin=${origin}`);
    }
  });

  it('uses Referer only when Origin is absent', () => {
    assert.equal(checkBotOrigin(bot, { referer: 'https://rubio.example/some/page?q=1' }, FRONTEND).allowed, true);
    assert.equal(checkBotOrigin(bot, { referer: 'https://evil.example/rubio.example' }, FRONTEND).allowed, false);
    assert.equal(checkBotOrigin(bot, { referer: 'https://rubio.example@evil.example/' }, FRONTEND).allowed, false);
    assert.equal(checkBotOrigin(bot, { referer: 'not a url' }, FRONTEND).allowed, false);
  });

  it('a present, valid but wrong Origin is never rescued by an allowed Referer', () => {
    const d = checkBotOrigin(bot, { origin: 'https://evil.example', referer: 'https://rubio.example/' }, FRONTEND);
    assert.equal(d.allowed, false);
  });

  it('localhost / 127.0.0.1 are allowed only when explicitly listed (any port, http or https)', () => {
    assert.equal(checkBotOrigin(bot, { origin: 'http://localhost:3000' }, FRONTEND).allowed, false);
    assert.equal(checkBotOrigin(restricted('localhost'), { origin: 'http://localhost:3000' }, FRONTEND).allowed, true);
    assert.equal(checkBotOrigin(restricted('127.0.0.1'), { origin: 'http://127.0.0.1:5173' }, FRONTEND).allowed, true);
    assert.equal(checkBotOrigin(restricted('localhost'), { origin: 'http://127.0.0.1:3000' }, FRONTEND).allowed, false);
  });

  it('exact Vercel preview host works; a different preview host does not', () => {
    const preview = restricted('rubio-preview-abc.vercel.app');
    assert.equal(checkBotOrigin(preview, { origin: 'https://rubio-preview-abc.vercel.app' }, FRONTEND).allowed, true);
    assert.equal(checkBotOrigin(preview, { origin: 'https://attacker.vercel.app' }, FRONTEND).allowed, false);
  });

  it('log-safe: control characters in claimed origin are neutralized', () => {
    const d = checkBotOrigin(bot, { origin: 'https://evil.example\r\nX-Injected: 1' }, FRONTEND);
    assert.equal(d.allowed, false);
    assert.ok(!/[\r\n]/.test(d.origin ?? ''));
  });
});
