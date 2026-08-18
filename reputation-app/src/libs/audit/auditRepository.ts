/**
 * Supabase data access layer for website_audits.
 * All operations use service-role key — no public access.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — created on first use so build-time env var absence doesn't crash
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _supabase;
}
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type AuditStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'manual_review'
  | 'reviewed'
  | 'contacted';

export type AuditRecord = {
  id: string;
  contact_name: string;
  business_name: string;
  email: string;
  phone?: string | null;
  business_type?: string | null;
  website_url: string;
  status: AuditStatus;
  failure_reason?: string | null;
  website_growth_score?: number | null;
  opportunity_score?: number | null;
  opportunity_label?: string | null;
  category_scores?: Record<string, unknown> | null;
  extracted_data?: Record<string, unknown> | null;
  findings?: Record<string, unknown>[] | null;
  strengths?: Record<string, unknown>[] | null;
  executive_summary?: string | null;
  recommendations?: string[] | null;
  recommended_package?: string | null;
  sales_angle?: string | null;
  raw_analysis_metadata?: Record<string, unknown> | null;
  report_html?: string | null;
  created_at: string;
  processing_started_at?: string | null;
  completed_at?: string | null;
  reviewed_at?: string | null;
  contacted_at?: string | null;
};

export type CreateAuditInput = {
  contact_name: string;
  business_name: string;
  email: string;
  phone?: string | null;
  business_type?: string | null;
  website_url: string;
};

export type UpdateAuditInput = Partial<Omit<AuditRecord, 'id' | 'created_at'>>;

export class AuditNotFoundError extends Error {
  constructor(id: string) {
    super(`Audit not found: ${id}`);
    this.name = 'AuditNotFoundError';
  }
}

export async function createAuditRecord(input: CreateAuditInput): Promise<AuditRecord> {
  const { data, error } = await supabase
    .from('website_audits')
    .insert({ ...input, status: 'pending' })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create audit record');
  }

  return data as AuditRecord;
}

export async function updateAuditRecord(id: string, updates: UpdateAuditInput): Promise<void> {
  const { error } = await supabase
    .from('website_audits')
    .update(updates)
    .eq('id', id);

  if (error) {
    throw new Error(error.message || `Failed to update audit ${id}`);
  }
}

export async function getAuditRecord(id: string): Promise<AuditRecord> {
  const { data, error } = await supabase
    .from('website_audits')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new AuditNotFoundError(id);
  }

  return data as AuditRecord;
}

// List for admin view — excludes report_html for performance
/**
 * Find a recent audit by email to prevent duplicate submissions.
 * Returns the most recent audit for this email within the given hours window,
 * if it is in a non-terminal state (pending, processing, or completed).
 */
export async function findRecentAuditByEmail(email: string, withinHours = 24): Promise<AuditRecord | null> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('website_audits')
    .select('id, status, created_at')
    .eq('email', email.toLowerCase())
    .in('status', ['pending', 'processing', 'completed'])
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (data as AuditRecord) || null;
}

/**
 * Attempt to atomically claim a pending audit for processing.
 * Uses a conditional update (only transitions pending→processing) to prevent
 * two concurrent workers from processing the same audit.
 * Returns true if this worker successfully claimed the record.
 */
export async function claimAuditForProcessing(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('website_audits')
    .update({ status: 'processing', processing_started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')   // only claim if still pending
    .select('id')
    .single();

  if (error || !data) return false;
  return true;
}

/**
 * Find audits stuck in 'pending' or 'processing' beyond the stale threshold.
 * These are jobs that likely died when the Railway process restarted.
 */
export async function findStaleAudits(staleAfterMinutes = 10): Promise<AuditRecord[]> {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString();

  const { data: stalePending } = await supabase
    .from('website_audits')
    .select('*')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .limit(10);

  const { data: staleProcessing } = await supabase
    .from('website_audits')
    .select('*')
    .eq('status', 'processing')
    .lt('processing_started_at', cutoff)
    .limit(10);

  return [
    ...((stalePending || []) as AuditRecord[]),
    ...((staleProcessing || []) as AuditRecord[]),
  ];
}

/**
 * Reset a stale audit back to pending so it can be retried.
 * Sets a failure_reason note explaining what happened.
 */
export async function resetStaleAudit(id: string, previousStatus: string): Promise<void> {
  await supabase
    .from('website_audits')
    .update({
      status: 'pending',
      processing_started_at: null,
      failure_reason: `Auto-reset from stale '${previousStatus}' state — process likely restarted`,
    })
    .eq('id', id)
    .in('status', ['pending', 'processing']); // safety guard: only reset if still stuck
}

export async function listAuditRecords(options: {
  limit?: number;
  offset?: number;
  status?: AuditStatus;
}): Promise<{ audits: Omit<AuditRecord, 'report_html'>[]; total: number }> {
  const limit = Math.min(options.limit || 25, 100);
  const offset = options.offset || 0;

  let query = supabase
    .from('website_audits')
    .select(
      'id,contact_name,business_name,email,phone,business_type,website_url,status,failure_reason,website_growth_score,opportunity_score,opportunity_label,recommended_package,executive_summary,sales_angle,findings,strengths,recommendations,category_scores,created_at,completed_at,reviewed_at,contacted_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to list audits');
  }

  return {
    audits: (data || []) as Omit<AuditRecord, 'report_html'>[],
    total: count || 0,
  };
}
