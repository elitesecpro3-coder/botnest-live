/**
 * Unit tests for the Website Growth Audit Engine
 * Uses Node.js built-in test runner (node --test).
 * Run: npx ts-node --require ts-node/register node --test src/audit/__tests__/audit.test.ts
 * Or via: npm test (after updating script glob)
 * These tests are fully offline — no network calls, no DB writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateAuditUrl } from '../fetcher';
import { extractSignals } from '../extractor';
import { classifySite } from '../classifier';
import { scoreWebsite } from '../scorer';

// ── URL Validation ────────────────────────────────────────────────────────────

describe('validateAuditUrl', () => {
  it('accepts valid https URL', () => {
    assert.equal(validateAuditUrl('https://example.com').valid, true);
  });

  it('accepts valid http URL', () => {
    assert.equal(validateAuditUrl('http://example.com').valid, true);
  });

  it('prepends https if no protocol given', () => {
    const r = validateAuditUrl('example.com');
    assert.equal(r.valid, true);
    if (r.valid) assert.equal(r.url.protocol, 'https:');
  });

  it('rejects localhost', () => {
    assert.equal(validateAuditUrl('http://localhost').valid, false);
    assert.equal(validateAuditUrl('http://localhost:3000').valid, false);
  });

  it('rejects .local domains', () => {
    assert.equal(validateAuditUrl('http://internal.local').valid, false);
  });

  it('rejects private IPv4 192.168.x.x', () => {
    assert.equal(validateAuditUrl('http://192.168.1.1').valid, false);
  });

  it('rejects private IPv4 10.x.x.x', () => {
    assert.equal(validateAuditUrl('http://10.0.0.1').valid, false);
  });

  it('rejects private IPv4 172.16.x.x', () => {
    assert.equal(validateAuditUrl('http://172.16.0.1').valid, false);
  });

  it('rejects loopback 127.0.0.1', () => {
    assert.equal(validateAuditUrl('http://127.0.0.1').valid, false);
  });

  it('rejects ftp:// protocol', () => {
    assert.equal(validateAuditUrl('ftp://example.com').valid, false);
  });

  it('rejects invalid URL format', () => {
    assert.equal(validateAuditUrl('not a url at all').valid, false);
  });

  it('accepts real business URL', () => {
    assert.equal(validateAuditUrl('https://www.hvaccompany.com/contact').valid, true);
  });

  // ── Cloud metadata endpoints ──────────────────────────────────────────────
  it('rejects AWS/GCP/Azure IMDS 169.254.169.254', () => {
    assert.equal(validateAuditUrl('http://169.254.169.254').valid, false);
  });

  it('rejects AWS/GCP/Azure IMDS 169.254.169.254 with path', () => {
    assert.equal(validateAuditUrl('http://169.254.169.254/latest/meta-data/').valid, false);
  });

  it('rejects GCP metadata.google.internal', () => {
    assert.equal(validateAuditUrl('http://metadata.google.internal').valid, false);
  });

  // ── IPv6 ranges ───────────────────────────────────────────────────────────
  it('rejects IPv6 loopback ::1 (bracket notation)', () => {
    assert.equal(validateAuditUrl('http://[::1]').valid, false);
  });

  it('rejects IPv6 link-local fe80::', () => {
    assert.equal(validateAuditUrl('http://[fe80::1]').valid, false);
  });

  it('rejects IPv6 ULA fc00::', () => {
    assert.equal(validateAuditUrl('http://[fc00::1]').valid, false);
  });

  it('rejects IPv6 ULA fd00::', () => {
    assert.equal(validateAuditUrl('http://[fd00::1]').valid, false);
  });

  // ── Link-local / APIPA ───────────────────────────────────────────────────
  it('rejects 169.254.x.x (link-local APIPA)', () => {
    assert.equal(validateAuditUrl('http://169.254.1.1').valid, false);
  });

  // ── Internal TLD variants ─────────────────────────────────────────────────
  it('rejects .corp domain', () => {
    assert.equal(validateAuditUrl('http://intranet.corp').valid, false);
  });

  it('rejects .home domain', () => {
    assert.equal(validateAuditUrl('http://router.home').valid, false);
  });

  it('rejects .lan domain', () => {
    assert.equal(validateAuditUrl('http://server.lan').valid, false);
  });

  // ── Bare hostnames (no dot) ───────────────────────────────────────────────
  it('rejects bare single-word hostname', () => {
    assert.equal(validateAuditUrl('http://internal').valid, false);
  });

  // ── Non-HTTP protocols ───────────────────────────────────────────────────
  it('rejects file:// protocol', () => {
    assert.equal(validateAuditUrl('file:///etc/passwd').valid, false);
  });

  it('rejects ssh:// protocol', () => {
    assert.equal(validateAuditUrl('ssh://root@server.example.com').valid, false);
  });

  it('rejects data: URI', () => {
    assert.equal(validateAuditUrl('data:text/html,<script>alert(1)</script>').valid, false);
  });

  // ── RFC 1918 completeness ─────────────────────────────────────────────────
  it('rejects 192.0.2.x (TEST-NET-1)', () => {
    assert.equal(validateAuditUrl('http://192.0.2.1').valid, false);
  });

  it('rejects 198.51.100.x (TEST-NET-2)', () => {
    assert.equal(validateAuditUrl('http://198.51.100.1').valid, false);
  });

  it('rejects 0.0.0.0', () => {
    assert.equal(validateAuditUrl('http://0.0.0.0').valid, false);
  });

  // ── Still accepts real sites ──────────────────────────────────────────────
  it('accepts real HVAC company URL', () => {
    assert.equal(validateAuditUrl('https://www.phoenixhvac.com').valid, true);
  });

  it('accepts real URL with path', () => {
    assert.equal(validateAuditUrl('https://dentist-office.com/contact-us').valid, true);
  });

  it('accepts URL without protocol (gets https prepended)', () => {
    const r = validateAuditUrl('plumbingcompany.com');
    assert.equal(r.valid, true);
    if (r.valid) assert.equal(r.url.protocol, 'https:');
  });
});

// ── Signal Extraction ─────────────────────────────────────────────────────────

const FAKE_META = {
  url: 'https://example.com',
  finalUrl: 'https://example.com',
  statusCode: 200 as number,
  responseTimeMs: 850,
  redirectCount: 0,
  pageWeightKb: 120,
};

const STRONG_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Phoenix HVAC Repair — Emergency AC Service 24/7</title>
  <meta name="description" content="Licensed HVAC repair in Phoenix AZ. Same-day service, 24/7 emergency. Call 602-555-1234.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.com">
  <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
  <script src="https://www.googletagmanager.com/gtag/js"></script>
</head>
<body>
  <header><nav>Phoenix HVAC Pros — Call 602-555-1234</nav></header>
  <main>
    <h1>Same-Day AC Repair in Phoenix</h1>
    <h2>Emergency Service Available</h2>
    <h2>Book Your Appointment Online</h2>
    <a href="https://calendly.com/phoenix-hvac/service">Book Now</a>
    <button>Get a Free Quote</button>
    <a href="tel:6025551234">Call 602-555-1234</a>
    <form><input name="name" required><input name="email" required><button type="submit">Contact Us</button></form>
    <section>
      <h2>What Our Customers Say</h2>
      <p class="testimonial">5 stars — amazing service!</p>
      <a href="https://google.com/maps/place/phoenix-hvac">Leave us a Google Review</a>
    </section>
    <p>Serving Phoenix, Scottsdale, Tempe, Mesa, and surrounding areas.</p>
    <a href="https://www.facebook.com/phoenixhvac">Facebook</a>
  </main>
</body>
</html>`;

const WEAK_HTML = `<!DOCTYPE html>
<html>
<head><title>Joe's Plumbing</title></head>
<body>
  <h1>Welcome to our website</h1>
  <p>We do plumbing. Call us.</p>
  <p>Email: joe@joesplumbing.com</p>
</body>
</html>`;

describe('extractSignals — strong site', () => {
  const s = extractSignals(STRONG_HTML, FAKE_META);

  it('extracts title', () => assert.ok(s.title?.includes('HVAC')));
  it('extracts meta description', () => assert.ok(s.metaDescription?.includes('Phoenix')));
  it('extracts H1', () => { assert.ok(s.h1s.length > 0); assert.ok(s.h1s[0].includes('AC Repair')); });
  it('detects HTTPS', () => assert.equal(s.isHttps, true));
  it('detects viewport meta', () => assert.equal(s.hasViewportMeta, true));
  it('detects structured data', () => assert.equal(s.hasStructuredData, true));
  it('extracts phone number', () => assert.ok(s.phoneNumbers.length > 0));
  it('detects phone in header', () => assert.equal(s.hasPhoneInHeader, true));
  it('detects CTA', () => assert.equal(s.hasCta, true));
  it('detects CTA above fold', () => assert.equal(s.hasCtaAboveFold, true));
  it('detects contact form', () => assert.equal(s.hasContactForm, true));
  it('detects booking link', () => assert.equal(s.hasBookingLink, true));
  it('detects Google Tag Manager', () => assert.ok(s.detectedIntegrations.includes('Google Tag Manager')));
  it('detects testimonials', () => assert.equal(s.hasTestimonials, true));
  it('detects Google review link', () => assert.equal(s.hasGoogleReviewLink, true));
  it('detects service area mention', () => assert.equal(s.hasServiceAreaMention, true));
  it('detects social links', () => assert.ok(s.socialLinks.length > 0));
});

describe('extractSignals — weak site', () => {
  const s = extractSignals(WEAK_HTML, { ...FAKE_META, finalUrl: 'http://joesplumbing.com' });

  it('no viewport meta', () => assert.equal(s.hasViewportMeta, false));
  it('not HTTPS', () => assert.equal(s.isHttps, false));
  it('no contact form', () => assert.equal(s.hasContactForm, false));
  it('no booking link', () => assert.equal(s.hasBookingLink, false));
  it('no testimonials', () => assert.equal(s.hasTestimonials, false));
  it('detects email in body', () => assert.ok(s.emails.includes('joe@joesplumbing.com')));
});

// ── Scoring ───────────────────────────────────────────────────────────────────

describe('scoreWebsite', () => {
  const strongSignals = extractSignals(STRONG_HTML, FAKE_META);
  const weakMeta = { ...FAKE_META, finalUrl: 'http://joesplumbing.com' };
  const weakSignals = extractSignals(WEAK_HTML, weakMeta);
  const strongClass = classifySite(strongSignals);
  const weakClass   = classifySite(weakSignals);

  it('strong site scores higher than weak site', () => {
    const strongScore = scoreWebsite(strongSignals, strongClass);
    const weakScore   = scoreWebsite(weakSignals, weakClass);
    assert.ok(strongScore.total > weakScore.total);
  });

  it('total never exceeds 100', () => {
    const scores = scoreWebsite(strongSignals, strongClass);
    assert.ok(scores.total <= 100);
    assert.ok(scores.total >= 0);
  });

  it('weak local service site gets high opportunity score', () => {
    const scores = scoreWebsite(weakSignals, weakClass);
    assert.ok(scores.opportunityScore > 40);
  });

  it('weak local service site gets HOT or WARM opportunity label', () => {
    const scores = scoreWebsite(weakSignals, weakClass);
    assert.ok(['HOT', 'WARM'].includes(scores.opportunityLabel));
  });

  it('produces all 7 categories', () => {
    const scores = scoreWebsite(strongSignals, strongClass);
    assert.equal(scores.categories.length, 7);
  });

  it('category scores do not exceed their max values', () => {
    const scores = scoreWebsite(strongSignals, strongClass);
    for (const cat of scores.categories) {
      assert.ok(cat.score <= cat.maxScore, `${cat.name}: ${cat.score} > ${cat.maxScore}`);
      assert.ok(cat.score >= 0);
    }
  });

  it('grade matches score thresholds', () => {
    const scores = scoreWebsite(strongSignals, strongClass);
    if      (scores.total >= 85) assert.equal(scores.grade, 'Strong');
    else if (scores.total >= 70) assert.equal(scores.grade, 'Good');
    else if (scores.total >= 55) assert.equal(scores.grade, 'Needs Improvement');
    else                         assert.equal(scores.grade, 'Significant Opportunity');
  });
});
