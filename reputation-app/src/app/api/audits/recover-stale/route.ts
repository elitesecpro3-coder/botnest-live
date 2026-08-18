/**
 * GET /api/audits/recover-stale
 *
 * Vercel Cron worker — runs every 10 minutes.
 * Scans for audits stuck in 'pending' or 'processing' beyond the stale threshold
 * and resets them back to 'pending' so the process-pending cron can retry them.
 *
 * After MAX_AUTO_RETRIES resets, marks the audit 'manual_review' instead.
 *
 * Security: requires CRON_SECRET query param (same as process-pending).
 *
 * Node.js runtime (consistency with pipeline).
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

import {
  findStaleAudits,
  resetStaleAudit,
  updateAuditRecord,
} from '@/libs/audit/auditRepository';

const MAX_AUTO_RETRIES     = 2;
const STALE_THRESHOLD_MINS = 10;

export async function GET(req: NextRequest) {
  const cronSecret = req.nextUrl.searchParams.get('secret');
  const expected   = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let stale;
  try {
    stale = await findStaleAudits(STALE_THRESHOLD_MINS);
  } catch (err) {
    console.error('[recover-stale] Query error:', err);
    return NextResponse.json({ error: 'Failed to query stale audits' }, { status: 500 });
  }

  if (stale.length === 0) {
    return NextResponse.json({ recovered: 0, message: 'No stale audits' });
  }

  console.log(`[recover-stale] Found ${stale.length} stale audit(s)`);
  const results: Array<{ id: string; action: 'reset' | 'manual_review' }> = [];

  for (const audit of stale) {
    const failureNote = audit.failure_reason || '';
    const resetCount  = (failureNote.match(/Auto-reset/g) || []).length;

    if (resetCount >= MAX_AUTO_RETRIES) {
      console.warn(`[recover-stale] ${audit.id} exceeded max retries — marking manual_review`);
      await updateAuditRecord(audit.id, {
        status: 'manual_review',
        failure_reason: `Exceeded ${MAX_AUTO_RETRIES} automatic retry attempts. Manual review required.`,
      });
      results.push({ id: audit.id, action: 'manual_review' });
    } else {
      console.log(`[recover-stale] Resetting ${audit.id} (retry ${resetCount + 1}/${MAX_AUTO_RETRIES})`);
      await resetStaleAudit(audit.id, audit.status);
      results.push({ id: audit.id, action: 'reset' });
    }
  }

  return NextResponse.json({ recovered: results.length, results });
}
