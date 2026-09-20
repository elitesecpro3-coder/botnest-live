/**
 * Domain/origin policy for the public widget endpoints.
 *
 * A bot with an EMPTY `allowed_domains` array is a legacy bot: behavior is identical to the
 * original global-CORS model (FRONTEND_ORIGINS), i.e. nothing changes for existing bots.
 *
 * A bot with a NON-EMPTY `allowed_domains` array is domain-restricted: the request must come from
 * a browser page whose host is listed. Entries are matched by exact host (case-insensitive, port,
 * path, query and fragment ignored). Subdomains are NOT implied: `example.com` does not admit
 * `www.example.com` - list both. A subdomain wildcard must be configured explicitly (`*.example.com`).
 *
 * SECURITY NOTE: Origin/Referer are headers a browser sets and page scripts cannot forge, so this
 * stops other WEBSITES from embedding a restricted bot. It is NOT authentication: a script, curl,
 * or any non-browser client can send any Origin/Referer it likes.
 */

export type BotDomainConfig = { allowed_domains?: string[] | null } | null | undefined;

export type HeaderBag = { origin?: string | string[]; referer?: string | string[] };

export type OriginDecision = {
  allowed: boolean;
  mode: 'restricted' | 'legacy';
  reason:
    | 'allowed'
    | 'legacy_allowed'
    | 'no_origin'
    | 'null_origin'
    | 'invalid_origin'
    | 'insecure_scheme'
    | 'origin_not_allowed'
    | 'legacy_origin_not_allowed';
  /** Sanitized, truncated description of what the request claimed. Safe to log. */
  origin: string | null;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

// Hosting platforms where any customer can claim a subdomain. A wildcard directly over one of these
// would authorize every tenant of the platform, so such entries are rejected.
const SHARED_HOSTING_SUFFIXES = new Set([
  'vercel.app', 'wixsite.com', 'wixstudio.io', 'editorx.io', 'netlify.app', 'github.io', 'pages.dev',
  'workers.dev', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'onrender.com', 'fly.dev',
  'azurewebsites.net', 'cloudfront.net', 'appspot.com', 'glitch.me', 'repl.co', 'ngrok.io',
  'ngrok-free.app', 'trycloudflare.com', 'myshopify.com', 'squarespace.com', 'weebly.com',
  'blogspot.com', 'wordpress.com',
]);

const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeForLog(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 200);
}

/** Extract a lowercase ASCII hostname from a URL, origin or bare `host[:port][/path]`. Null if unusable. */
export function parseHost(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let host = url.hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host || host.startsWith('.') || host.includes('..')) return null;
  // IDNs are already punycoded by the URL parser; anything else outside this set is rejected
  // (this also rejects IPv6 literals, which are unsupported).
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

/**
 * Canonicalize one configured `allowed_domains` entry to `host` or `*.host`.
 * Returns null for anything that is not a usable entry (callers must then treat it as matching nothing).
 */
export function normalizeDomainEntry(entry: unknown): string | null {
  if (typeof entry !== 'string') return null;
  const raw = entry.trim().toLowerCase();
  if (!raw) return null;

  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  if (withoutScheme.startsWith('*.')) {
    const base = parseHost(withoutScheme.slice(2));
    if (!base || IPV4.test(base) || !base.includes('.')) return null;
    if (SHARED_HOSTING_SUFFIXES.has(base)) return null;
    const labels = base.split('.');
    if (labels.length === 2 && SECOND_LEVEL_LABELS.has(labels[0]) && labels[1].length === 2) return null; // e.g. *.co.uk
    return `*.${base}`;
  }
  return parseHost(raw);
}

export function normalizeDomainList(entries: unknown[]): { valid: string[]; invalid: unknown[] } {
  const valid: string[] = [];
  const invalid: unknown[] = [];
  for (const entry of entries) {
    const normalized = normalizeDomainEntry(entry);
    if (normalized) {
      if (!valid.includes(normalized)) valid.push(normalized);
    } else {
      invalid.push(entry);
    }
  }
  return { valid, invalid };
}

export function hostMatchesEntry(host: string, entry: string): boolean {
  if (entry.startsWith('*.')) {
    const base = entry.slice(2);
    return host.length > base.length + 1 && host.endsWith(`.${base}`);
  }
  return host === entry;
}

type RequestOrigin =
  | { kind: 'ok'; source: 'origin' | 'referer'; scheme: 'http' | 'https'; host: string }
  | { kind: 'none'; reason: 'no_origin' | 'null_origin' | 'invalid_origin'; claimed: string | null };

/**
 * Origin is authoritative when present. Referer is used ONLY when the Origin header is absent
 * (an `Origin: null` or a malformed Origin is never rescued by Referer).
 */
export function extractRequestOrigin(headers: HeaderBag): RequestOrigin {
  const origin = firstHeader(headers.origin);
  if (origin !== undefined) {
    const claimed = sanitizeForLog(origin);
    if (origin.trim().toLowerCase() === 'null') return { kind: 'none', reason: 'null_origin', claimed };
    const match = /^(https?):\/\/([^/?#@\s]+)$/i.exec(origin.trim());
    const host = match ? parseHost(`${match[1]}://${match[2]}`) : null;
    if (!match || !host) return { kind: 'none', reason: 'invalid_origin', claimed };
    return { kind: 'ok', source: 'origin', scheme: match[1].toLowerCase() as 'http' | 'https', host };
  }

  const referer = firstHeader(headers.referer);
  if (referer) {
    try {
      const url = new URL(referer);
      const host = parseHost(`${url.protocol}//${url.host}`);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && host) {
        return { kind: 'ok', source: 'referer', scheme: url.protocol === 'https:' ? 'https' : 'http', host };
      }
    } catch {
      /* fall through */
    }
    return { kind: 'none', reason: 'invalid_origin', claimed: sanitizeForLog(referer) };
  }

  return { kind: 'none', reason: 'no_origin', claimed: null };
}

export function getFrontendOriginsFromEnv(): string[] {
  return (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isDomainRestricted(bot: BotDomainConfig): boolean {
  return Array.isArray(bot?.allowed_domains) && bot!.allowed_domains!.length > 0;
}

/**
 * Decide whether this request may use this bot.
 * `bot` may be null/undefined for unknown/demo bot ids, which follow the legacy rule.
 */
export function checkBotOrigin(
  bot: BotDomainConfig,
  headers: HeaderBag,
  frontendOrigins: string[] = getFrontendOriginsFromEnv(),
): OriginDecision {
  if (!isDomainRestricted(bot)) {
    // Legacy behavior: exactly what the global CORS middleware enforced before this feature.
    const origin = firstHeader(headers.origin);
    if (!origin || frontendOrigins.length === 0 || frontendOrigins.includes(origin)) {
      return { allowed: true, mode: 'legacy', reason: 'legacy_allowed', origin: origin ? sanitizeForLog(origin) : null };
    }
    return { allowed: false, mode: 'legacy', reason: 'legacy_origin_not_allowed', origin: sanitizeForLog(origin) };
  }

  // Restricted bot. A non-empty list containing only invalid entries matches nothing (fails closed).
  const requestOrigin = extractRequestOrigin(headers);
  if (requestOrigin.kind === 'none') {
    return { allowed: false, mode: 'restricted', reason: requestOrigin.reason, origin: requestOrigin.claimed };
  }

  const described = `${requestOrigin.scheme}://${requestOrigin.host}`;
  if (requestOrigin.scheme !== 'https' && !LOOPBACK_HOSTS.has(requestOrigin.host)) {
    return { allowed: false, mode: 'restricted', reason: 'insecure_scheme', origin: described };
  }

  const entries = bot!.allowed_domains!
    .map((entry) => normalizeDomainEntry(entry))
    .filter((entry): entry is string => entry !== null);

  if (entries.some((entry) => hostMatchesEntry(requestOrigin.host, entry))) {
    return { allowed: true, mode: 'restricted', reason: 'allowed', origin: described };
  }
  return { allowed: false, mode: 'restricted', reason: 'origin_not_allowed', origin: described };
}
