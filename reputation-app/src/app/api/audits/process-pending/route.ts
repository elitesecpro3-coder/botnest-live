/**
 * GET /api/audits/process-pending
 *
 * Vercel Cron worker — runs every 1 minute.
 * Picks up pending audit records and runs the full pipeline on each.
 *
 * Security: requires CRON_SECRET (set in Vercel dashboard, embedded in vercel.json cron path).
 * Random visitors hitting this URL without the secret get 401 — they cannot trigger
 * expensive OpenAI/fetch calls.
 *
 * Concurrency: processes up to MAX_BATCH audits per invocation.
 * Each audit is claimed atomically before processing — two concurrent cron ticks
 * cannot process the same audit.
 *
 * Error isolation: one audit failing does NOT prevent other audits from processing.
 *
 * Node.js runtime required: audit pipeline uses dns/promises and net modules.
 */

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro: up to 60s per invocation

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

import { runAuditPipeline } from '@/libs/audit/auditPipeline';
import type { AuditRecord } from '@/libs/audit/auditRepository';
import { createClient } from '@supabase/supabase-js';

// Conservative batch size — keeps total invocation time safely under 60s
// Each audit takes ~20-30s. One per tick is the safest default.
// If audit volume increases, raise to 2 but only after verifying p95 < 55s.
const MAX_BATCH = 1;

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: key });
}

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(req: NextRequest) {
  // Cron secret validation — Vercel sends secret via query param embedded in vercel.json
  const cronSecret = req.nextUrl.searchParams.get('secret');
  const expected   = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch oldest pending audits (up to batch size)
  const { data: pending, error } = await supabase
    .from('website_audits')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error('[process-pending] Supabase query error:', error.message);
    return NextResponse.json({ error: 'Failed to query pending audits' }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No pending audits' });
  }

  const openai = getOpenAI();
  const results: Array<{ id: string; outcome: 'ok' | 'error'; detail?: string }> = [];

  for (const record of pending as AuditRecord[]) {
    try {
      await runAuditPipeline(record, openai);
      results.push({ id: record.id, outcome: 'ok' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[process-pending] Unhandled error for audit ${record.id}:`, err);
      results.push({ id: record.id, outcome: 'error', detail: detail.slice(0, 200) });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
