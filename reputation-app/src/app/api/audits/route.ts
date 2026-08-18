/**
 * POST /api/audits  — create a new audit job (public, rate-limited)
 * GET  /api/audits  — list all audits (admin-only, requires x-admin-key)
 *
 * Node.js runtime required: uses dns/promises and net for SSRF protection.
 */

export const runtime = 'nodejs';
export const maxDuration = 10; // create is fast; processing happens in cron

import { NextRequest, NextResponse } from 'next/server';

import {
  AuditStatus,
  createAuditRecord,
  findRecentAuditByEmail,
  listAuditRecords,
} from '@/libs/audit/auditRepository';
import {
  validateAuditUrl,
} from '@/libs/audit/fetcher';

// ── Rate limiting (in-memory, per-process) ──────────────────────────────────
// Vercel spawns many instances; this is per-instance. For strict enforcement,
// move to Upstash/Redis. For audit volumes this lightweight approach is fine.
const submitWindow = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX   = 2;
const RATE_WINDOW_MS   = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = submitWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    submitWindow.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function asTrimmed(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// ── POST /api/audits ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Extract IP for rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many audit requests from this address. Please try again in an hour.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contactName  = asTrimmed(body.name || body.contact_name);
  const businessName = asTrimmed(body.business_name);
  const email        = asTrimmed(body.email);
  const websiteUrl   = asTrimmed(body.website || body.website_url);
  const phone        = asTrimmed(body.phone) || null;
  const businessType = asTrimmed(body.business_type) || null;

  if (!contactName || !businessName || !email || !websiteUrl) {
    return NextResponse.json(
      { error: 'name, business_name, email, and website are required' },
      { status: 400 },
    );
  }

  // Field length guards
  if (
    contactName.length  > 200 ||
    businessName.length > 200 ||
    email.length        > 320 ||
    websiteUrl.length   > 2048
  ) {
    return NextResponse.json(
      { error: 'One or more fields exceed maximum allowed length.' },
      { status: 400 },
    );
  }

  // Basic email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // SSRF-safe URL validation
  const validation = validateAuditUrl(websiteUrl);
  if (!validation.valid) {
    return NextResponse.json(
      { error: `Invalid website URL: ${validation.reason}` },
      { status: 400 },
    );
  }

  try {
    // 24-hour email dedup
    const recentAudit = await findRecentAuditByEmail(email, 24);
    if (recentAudit) {
      return NextResponse.json(
        {
          audit_id: recentAudit.id,
          status: recentAudit.status,
          message: 'An audit for this email was recently submitted. Returning existing audit.',
          poll_url: `/api/audits/${recentAudit.id}`,
          deduplicated: true,
        },
        { status: 202 },
      );
    }

    // Create record — status: pending
    // Processing is picked up by the next cron tick (≤60s)
    const audit = await createAuditRecord({
      contact_name: contactName,
      business_name: businessName,
      email,
      phone,
      business_type: businessType,
      website_url: validation.url.href,
    });

    return NextResponse.json(
      {
        audit_id: audit.id,
        status: 'pending',
        message: 'Your website is being analyzed. This typically takes 30–90 seconds.',
        poll_url: `/api/audits/${audit.id}`,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('[POST /api/audits]', err);
    return NextResponse.json(
      { error: 'Failed to create audit. Please try again.' },
      { status: 500 },
    );
  }
}

// ── GET /api/audits  (admin list) ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey || adminKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(parseInt(searchParams.get('limit')  || '25'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const status = searchParams.get('status') || undefined;

  try {
    const { audits, total } = await listAuditRecords({
      limit,
      offset,
      status: status as AuditStatus | undefined,
    });
    return NextResponse.json({ audits, total, limit, offset });
  } catch (err) {
    console.error('[GET /api/audits]', err);
    return NextResponse.json({ error: 'Failed to list audits' }, { status: 500 });
  }
}
