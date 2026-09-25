import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contrastRatio, toPoweredBy, toWidgetTheme } from '../lib/widgetTheme';

describe('toWidgetTheme', () => {
  it('returns undefined for null/absent/non-object input (legacy bots)', () => {
    assert.equal(toWidgetTheme(null), undefined);
    assert.equal(toWidgetTheme(undefined), undefined);
    assert.equal(toWidgetTheme('#0B1F3B'), undefined);
    assert.equal(toWidgetTheme(['#0B1F3B']), undefined);
    assert.equal(toWidgetTheme({}), undefined);
  });

  it('passes through a fully valid, high-contrast theme unchanged (lowercased)', () => {
    const theme = toWidgetTheme({ primary: '#0B1F3B', accent: '#0071E3', background: '#FFFFFF', text: '#172233' });
    assert.deepEqual(theme, { primary: '#0b1f3b', accent: '#0071e3', background: '#ffffff', text: '#172233' });
  });

  it('drops individually invalid color formats, keeping the rest', () => {
    const theme = toWidgetTheme({ primary: 'navy', accent: '#0071E3', background: 'rgb(0,0,0)', text: '#172233' });
    assert.deepEqual(theme, { accent: '#0071e3' });
  });

  it('rejects non-hex injection attempts (url(), javascript:, expression())', () => {
    for (const bad of ['url(javascript:alert(1))', 'expression(alert(1))', 'javascript:alert(1)', '#0B1F3B; background:red', 'red']) {
      assert.equal(toWidgetTheme({ primary: bad }), undefined, bad);
    }
  });

  it('requires exactly 6 hex digits (rejects 3-digit shorthand and 8-digit alpha)', () => {
    assert.equal(toWidgetTheme({ primary: '#fff' }), undefined);
    assert.equal(toWidgetTheme({ primary: '#0B1F3Bff' }), undefined);
  });

  it('drops a low-contrast primary/accent (white text would be illegible) but keeps others', () => {
    // #FF8A1E on white is ~2.36:1 — below the 3:1 floor for large UI/white text.
    const theme = toWidgetTheme({ primary: '#0B1F3B', accent: '#FF8A1E' });
    assert.deepEqual(theme, { primary: '#0b1f3b' });
  });

  it('accepts a darker orange that clears the contrast floor', () => {
    const theme = toWidgetTheme({ accent: '#CC5500' });
    assert.deepEqual(theme, { accent: '#cc5500' });
  });

  it('treats background/text as a pair — drops both if either fails validation or contrast', () => {
    assert.equal(toWidgetTheme({ background: '#FFFFFF' })?.background, undefined); // no text partner
    assert.equal(toWidgetTheme({ text: '#172233' })?.text, undefined); // no background partner
    // Low contrast pair (light gray text on white) must be dropped entirely.
    assert.equal(toWidgetTheme({ background: '#FFFFFF', text: '#EEEEEE' }), undefined);
    // Valid, high-contrast pair is kept together.
    assert.deepEqual(toWidgetTheme({ background: '#FFFFFF', text: '#172233' }), { background: '#ffffff', text: '#172233' });
  });

  it('is order/case independent and trims whitespace', () => {
    assert.deepEqual(toWidgetTheme({ primary: '  #0B1F3B  ' }), { primary: '#0b1f3b' });
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black vs white and 1:1 for identical colors', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
    assert.equal(contrastRatio('#123456', '#123456'), 1);
  });

  it('is symmetric', () => {
    assert.equal(contrastRatio('#0b1f3b', '#ffffff'), contrastRatio('#ffffff', '#0b1f3b'));
  });
});

describe('toPoweredBy', () => {
  it('is off by default and when explicitly false/undefined (legacy bots)', () => {
    assert.equal(toPoweredBy(false, null, null), undefined);
    assert.equal(toPoweredBy(undefined, null, null), undefined);
    assert.equal(toPoweredBy(null, null, null), undefined);
  });

  it('uses the default label/url when enabled with no overrides', () => {
    assert.deepEqual(toPoweredBy(true, null, null), { text: 'Powered by BotNest', url: 'https://bot-nest.com' });
  });

  it('applies valid overrides', () => {
    assert.deepEqual(
      toPoweredBy(true, 'Built with BotNest', 'https://bot-nest.com/pricing'),
      { text: 'Built with BotNest', url: 'https://bot-nest.com/pricing' },
    );
  });

  it('falls back to defaults for an unsafe URL scheme (never returns javascript:/data: to the browser)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com', 'not a url']) {
      assert.deepEqual(toPoweredBy(true, null, bad), { text: 'Powered by BotNest', url: 'https://bot-nest.com' }, bad);
    }
  });

  it('accepts a plain http URL (local/dev use)', () => {
    assert.deepEqual(toPoweredBy(true, null, 'http://localhost:3000'), { text: 'Powered by BotNest', url: 'http://localhost:3000' });
  });

  it('caps an overly long label rather than truncate to something misleading-but-silent', () => {
    const result = toPoweredBy(true, 'x'.repeat(500), null);
    assert.equal(result?.text.length, 40);
  });

  it('ignores a blank/whitespace-only override', () => {
    assert.deepEqual(toPoweredBy(true, '   ', '   '), { text: 'Powered by BotNest', url: 'https://bot-nest.com' });
  });
});
