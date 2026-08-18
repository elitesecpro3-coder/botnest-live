/**
 * Safe website fetcher with SSRF protection.
 * Validates URL, blocks private IP ranges, enforces timeouts and size limits.
 */

import { lookup } from 'dns/promises';
import * as net from 'net';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS   = 12_000;
const MAX_REDIRECTS      = 4;

export type FetchResult = {
  ok: true;
  url: string;           // final URL after redirects
  statusCode: number;
  html: string;
  contentType: string;
  responseTimeMs: number;
  redirectCount: number;
};

export type FetchError = {
  ok: false;
  reason: string;        // user-safe description
  detail?: string;       // technical detail for logging
};

export type FetchOutcome = FetchResult | FetchError;

// ── URL validation ──────────────────────────────────────────────────────────

export function validateAuditUrl(raw: string): { valid: true; url: URL } | { valid: false; reason: string } {
  const trimmed = raw.trim();

  // Reject any explicit non-http(s) scheme before normalization
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { valid: false, reason: 'Only HTTP and HTTPS URLs are supported.' };
  }

  let url: URL;
  try {
    // Prepend https if no protocol provided
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    url = new URL(normalized);
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTP and HTTPS URLs are supported.' };
  }

  // Decode percent-encoding in hostname to prevent bypass via %6c%6f%63%61%6c%68%6f%73%74
  let hostname: string;
  try {
    hostname = decodeURIComponent(url.hostname).toLowerCase();
  } catch {
    hostname = url.hostname.toLowerCase();
  }

  // Block obvious localhost / loopback / internal hostnames
  const blockedHostnames = new Set([
    'localhost', '0.0.0.0', 'ip6-localhost', 'ip6-loopback', 'broadcasthost',
  ]);
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.lan')
  ) {
    return { valid: false, reason: 'Internal hostnames are not allowed.' };
  }

  // Block cloud metadata service hostnames by name
  const blockedMetadataHosts = new Set([
    'metadata.google.internal',
    'metadata.goog',
    'metadata',
    'instance-data',
  ]);
  if (blockedMetadataHosts.has(hostname)) {
    return { valid: false, reason: 'Cloud metadata endpoints are not allowed.' };
  }

  // Block raw IPv4/IPv6 private ranges at the URL level
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { valid: false, reason: 'Private IP addresses are not allowed.' };
    }
  }

  // Hostname must contain at least one dot (rejects bare single-word hosts)
  if (!hostname.includes('.') && !net.isIP(hostname)) {
    return { valid: false, reason: 'Hostname must be a valid domain name.' };
  }

  return { valid: true, url };
}

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv4 private/reserved ranges
  const privateRanges4 = [
    /^10\./,                                          // RFC 1918
    /^172\.(1[6-9]|2\d|3[01])\./,                    // RFC 1918
    /^192\.168\./,                                    // RFC 1918
    /^127\./,                                         // loopback
    /^169\.254\./,                                    // link-local / APIPA (IMDS on AWS)
    /^0\./,                                           // "this" network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,     // RFC 6598 carrier-grade NAT
    /^192\.0\.0\./,                                   // IETF protocol assignments
    /^192\.0\.2\./,                                   // TEST-NET-1
    /^198\.51\.100\./,                                // TEST-NET-2
    /^203\.0\.113\./,                                 // TEST-NET-3
    /^240\./,                                         // reserved
    /^255\.255\.255\.255$/,                           // broadcast
    /^198\.(18|19)\./,                                // benchmark testing
  ];
  for (const re of privateRanges4) {
    if (re.test(ip)) return true;
  }

  // Cloud metadata endpoints (explicit block regardless of DNS resolution)
  // AWS, GCP, Azure, DigitalOcean, Oracle all use 169.254.169.254
  if (ip === '169.254.169.254') return true;
  // GCP also exposes metadata at fd00:ec2::254 and similar
  if (ip === 'fd00:ec2::254') return true;

  // IPv6 loopback / link-local / private / reserved
  if (ip === '::1') return true;
  if (ip === '::') return true;
  if (lower.startsWith('fe80:')) return true;             // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA private
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — extract the embedded IPv4 and re-check
    const embedded = ip.slice(7);
    if (net.isIPv4(embedded)) return isPrivateIp(embedded);
  }
  if (lower === '0:0:0:0:0:0:0:1') return true;          // full-form ::1
  if (lower.startsWith('2001:db8:')) return true;         // documentation range
  if (lower.startsWith('100::')) return true;             // discard prefix

  return false;
}

async function resolveAndCheckIp(hostname: string): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        return { blocked: true, reason: `Hostname resolves to private IP: ${address}` };
      }
    }
    return { blocked: false };
  } catch {
    // DNS failure — we'll let the fetch attempt fail naturally
    return { blocked: false };
  }
}

// ── Fetcher ─────────────────────────────────────────────────────────────────

export async function fetchWebsite(inputUrl: URL): Promise<FetchOutcome> {
  const start = Date.now();

  // DNS-level SSRF check
  const dnsCheck = await resolveAndCheckIp(inputUrl.hostname);
  if (dnsCheck.blocked) {
    return { ok: false, reason: 'URL resolves to a restricted address.', detail: dnsCheck.reason };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let currentUrl = inputUrl.href;
  let redirectCount = 0;

  try {
    let response: Response | null = null;

    while (redirectCount <= MAX_REDIRECTS) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'BotNest-AuditBot/1.0 (website growth audit; contact: rick@bot-nest.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'manual', // handle redirects manually so we can DNS-check each hop
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirectCount >= MAX_REDIRECTS) {
          return { ok: false, reason: `Too many redirects (>${MAX_REDIRECTS}) — site may be misconfigured.` };
        }

        const location = response.headers.get('location');
        if (!location) break;

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return { ok: false, reason: 'Redirect contained an invalid URL.' };
        }

        // Validate each redirect target — catches redirect from public→private (DNS rebinding defence)
        const validation = validateAuditUrl(nextUrl.href);
        if (!validation.valid) {
          return { ok: false, reason: `Redirect to disallowed URL: ${validation.reason}` };
        }

        // Re-check DNS after every redirect hop
        const redirectDnsCheck = await resolveAndCheckIp(nextUrl.hostname);
        if (redirectDnsCheck.blocked) {
          return { ok: false, reason: 'Redirect target resolves to a restricted address.' };
        }

        currentUrl = nextUrl.href;
        redirectCount++;
        continue;
      }

      break;
    }

    if (!response) {
      return { ok: false, reason: 'No response received from website.' };
    }

    if (response.status === 429) {
      return { ok: false, reason: 'Website is rate-limiting requests. Try again later.' };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return { ok: false, reason: `Website returned non-HTML content type: ${contentType.split(';')[0]}` };
    }

    // Stream with size cap
    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, reason: 'Could not read website response body.' };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel();
          break; // truncate — we still have a usable chunk
        }
        chunks.push(value);
      }
    }

    const combined = new Uint8Array(totalBytes <= MAX_RESPONSE_BYTES ? totalBytes : MAX_RESPONSE_BYTES);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(combined);
    const responseTimeMs = Date.now() - start;

    return {
      ok: true,
      url: currentUrl,
      statusCode: response.status,
      html,
      contentType,
      responseTimeMs,
      redirectCount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      return { ok: false, reason: `Website took too long to respond (>${FETCH_TIMEOUT_MS / 1000}s).`, detail: msg };
    }
    return { ok: false, reason: 'Could not reach the website.', detail: msg };
  } finally {
    clearTimeout(timer);
  }
}
