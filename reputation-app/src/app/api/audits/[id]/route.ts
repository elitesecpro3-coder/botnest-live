/**
 * GET  /api/audits/[id]               — poll status + public results
 * GET  /api/audits/[id]?action=report  — return HTML report (admin only)
 * POST /api/audits/[id]?action=status      — update status (admin only)
 * POST /api/audits/[id]?action=reanalyze   — reset to pending (admin only)
 *
 * Node.js runtime required for consistency with the audit pipeline.
 */

export const runtime = 'nodejs';
export const maxDuration = 10;

import { NextRequest, NextResponse } from 'next/server';

import {
  AuditNotFoundError,
  getAuditRecord,
  updateAuditRecord,
} from '@/libs/audit/auditRepository';

function gradeFromScore(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Needs Improvement';
  return 'Significant Opportunity';
}

function requireAdminKey(req: NextRequest): boolean {
  const key = req.headers.get('x-admin-key');
  const expected = process.env.ADMIN_API_KEY;
  return !!(expected && key === expected);
}

// ── GET /api/audits/[id] ────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const action = req.nextUrl.searchParams.get('action');

  try {
    const audit = await getAuditRecord(id);

    // Report HTML — admin only
    if (action === 'report') {
      if (!requireAdminKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (audit.status !== 'completed' || !audit.report_html) {
        return NextResponse.json(
          { error: 'Report not yet available', status: audit.status },
          { status: 404 },
        );
      }
      return new NextResponse(audit.report_html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Admin full record
    if (action === 'full') {
      if (!requireAdminKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json(audit);
    }

    // Public polling response — no internal sales data
    const isComplete = audit.status === 'completed';
    return NextResponse.json({
      audit_id: audit.id,
      status: audit.status,
      business_name: audit.business_name,
      website_url: audit.website_url,
      created_at: audit.created_at,
      completed_at: audit.completed_at || null,
      failure_reason: ['failed', 'manual_review'].includes(audit.status)
        ? audit.failure_reason
        : undefined,
      website_growth_score: isComplete ? audit.website_growth_score : null,
      grade: isComplete ? gradeFromScore(audit.website_growth_score) : null,
      executive_summary: isComplete ? audit.executive_summary : null,
      category_scores: isComplete ? audit.category_scores : null,
      findings: isComplete ? (audit.findings || []).slice(0, 5) : null,
      strengths: isComplete ? audit.strengths : null,
      recommendations: isComplete ? audit.recommendations : null,
    });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }
    console.error(`[GET /api/audits/${id}]`, err);
    return NextResponse.json({ error: 'Failed to retrieve audit' }, { status: 500 });
  }
}

// ── POST /api/audits/[id] ───────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const action = req.nextUrl.searchParams.get('action');

  if (!requireAdminKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Update status
    if (action === 'status') {
      const body = await req.json() as { status?: string };
      const validStatuses = ['reviewed', 'contacted', 'manual_review', 'pending'];
      if (!body.status || !validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Status must be one of: ${validStatuses.join(', ')}` },
          { status: 400 },
        );
      }
      const updates: Record<string, unknown> = { status: body.status };
      if (body.status === 'reviewed')  updates.reviewed_at  = new Date().toISOString();
      if (body.status === 'contacted') updates.contacted_at = new Date().toISOString();
      await updateAuditRecord(id, updates);
      return NextResponse.json({ success: true, status: body.status });
    }

    // Reset to pending for reanalysis (will be picked up by next cron tick)
    if (action === 'reanalyze') {
      const audit = await getAuditRecord(id);
      if (['processing', 'pending'].includes(audit.status)) {
        return NextResponse.json({ error: 'Audit is already in progress' }, { status: 409 });
      }
      await updateAuditRecord(id, { status: 'pending', failure_reason: null });
      return NextResponse.json({
        audit_id: id,
        status: 'pending',
        message: 'Audit reset to pending — will be picked up by next cron tick (≤60s)',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error(`[POST /api/audits/${id}]`, err);
    return NextResponse.json({ error: 'Failed to update audit' }, { status: 500 });
  }
}
