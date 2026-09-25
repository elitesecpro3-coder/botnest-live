import { createClient } from '@supabase/supabase-js';

export type BotConfigRow = {
  id: string;
  user_id?: string;
  slug?: string;
  name?: string;
  business_name?: string;
  website?: string;
  industry?: string;
  description?: string;
  tone?: string;
  booking_link?: string;
  services?: unknown;
  lead_capture_enabled?: boolean;
  fallback_contact?: string;
  welcome_message?: string;
  system_prompt?: string;
  prompt?: string;
  usage_count?: number | null;
  usage_limit?: number | null;
  notification_email?: string | null;
  plan?: string | null;
  market?: string | null;
  is_active?: boolean | null;
  /** Approved widget hosts. Empty/absent = legacy unrestricted bot. Never expose to the browser. */
  allowed_domains?: string[] | null;
  /** Optional widget quick-reply override: JSON array of {label, message?, action?}. Null = widget default. */
  quick_replies?: unknown;
  /** Optional per-bot widget color theme: {primary, accent, background, text}. Null = legacy default. */
  widget_theme?: unknown;
  /** "Powered by BotNest" attribution. Default false preserves current (no attribution) behavior. */
  show_powered_by?: boolean | null;
  powered_by_text?: string | null;
  powered_by_url?: string | null;
  // Lifecycle fields
  status?: string | null;
  stripe_status?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  payment_failed_at?: string | null;
  suspended_at?: string | null;
  canceled_at?: string | null;
  deleted_at?: string | null;
};

export type CreateBotConfigInput = {
  id?: string;
  user_id: string;
  business_name: string;
  website?: string | null;
  tone?: string;
  industry?: string;
  description?: string;
  booking_link?: string | null;
  notification_email?: string | null;
  usage_count?: number;
  usage_limit?: number;
  welcome_message?: string | null;
  system_prompt?: string | null;
  fallback_contact?: string | null;
  lead_capture_enabled?: boolean;
  plan?: string | null;
  market?: string | null;
  is_active?: boolean;
  allowed_domains?: string[];
};

export type LeadRow = {
  id: string;
  bot_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
};

export type CreateLeadInput = {
  bot_id: string;
  conversation_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  industry?: string | null;
  pain_points?: string[] | null;
  intent_score?: number | null;
  status?: string;
};

export type LeadUpsertResult = {
  row: LeadRow;
  /** True if this call merged into an existing recent lead instead of inserting a new row. */
  isDuplicate: boolean;
};

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  _supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _supabase;
}

// Proxy so all callers can use `supabase.from(...)` unchanged.
const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});

export class BotNotFoundError extends Error {
  constructor(botId: string) {
    super(`Unknown botId: ${botId}`);
    this.name = 'BotNotFoundError';
  }
}

export class DuplicateBotIdError extends Error {
  constructor(botId: string) {
    super(`Bot id already exists: ${botId}`);
    this.name = 'DuplicateBotIdError';
  }
}

export class LeadInsertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadInsertError';
  }
}

export async function getBotConfig(botId: string): Promise<BotConfigRow> {
  const { data, error } = await supabase
    .from('bots')
    .select('*')
    .eq('id', botId)
    .single();

  if (error || !data) {
    throw new BotNotFoundError(botId);
  }

  const bot = data as BotConfigRow;
  console.log('DB bot fetched:', bot);

  return bot;
}

export async function createBotConfig(input: CreateBotConfigInput): Promise<BotConfigRow> {
  const { data, error } = await supabase
    .schema('public')
    .from('bots')
    .insert(input)
    .select('*')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      throw new DuplicateBotIdError(input.id || 'unknown');
    }

    throw new Error(error?.message || 'Failed to create bot');
  }

  return data as BotConfigRow;
}

// Duplicate-lead detection window. The widget's own scripted lead form and the AI's tool-based
// capture are two independent client paths that don't share state — a visitor can trigger both in
// one browsing session, and a customer clicking a "call me now" link twice within a few minutes is
// almost always the same inquiry, not two. 30 minutes catches both without merging genuinely
// separate visits days apart. Matching is bot-scoped and based on the visitor's own contact info,
// not any browser/session state, so it works even across sessions/devices for the same bot.
const LEAD_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** Digits-only, last 10 — tolerant of "(555) 123-4567" vs "5551234567" vs "+1 555 123 4567". */
function normalizePhoneForDedupe(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

function normalizeEmailForDedupe(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

type RecentLeadCandidate = LeadRow & {
  industry?: string | null;
  pain_points?: string[] | null;
  intent_score?: number | null;
};

/**
 * Inserts a lead, unless a recent lead for the SAME bot with a matching normalized phone or email
 * already exists (see LEAD_DEDUPE_WINDOW_MS) — in which case that row is updated in place (filling
 * in any field it was missing, and keeping the fuller name) instead of inserting a duplicate.
 *
 * Never stores a rewritten/normalized phone or email — only ever used in-memory for comparison, so
 * this makes no change to how contact info is displayed for any bot, including existing customers.
 *
 * Callers MUST check `isDuplicate` and skip sending a new lead-notification email when it is true —
 * that business was already notified for this contact within the window.
 */
export async function createOrUpdateLead(input: CreateLeadInput): Promise<LeadUpsertResult> {
  const normPhone = normalizePhoneForDedupe(input.phone);
  const normEmail = normalizeEmailForDedupe(input.email);

  if (normPhone || normEmail) {
    const since = new Date(Date.now() - LEAD_DEDUPE_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .schema('public')
      .from('leads')
      .select('*')
      .eq('bot_id', input.bot_id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    const candidates = (recent ?? []) as RecentLeadCandidate[];
    const match = candidates.find((row) => {
      const rowPhone = normalizePhoneForDedupe(row.phone);
      const rowEmail = normalizeEmailForDedupe(row.email);
      return (normPhone && rowPhone && rowPhone === normPhone) || (normEmail && rowEmail && rowEmail === normEmail);
    });

    if (match) {
      const patch: Record<string, unknown> = {};
      if (input.email && !match.email) patch.email = input.email;
      if (input.phone && !match.phone) patch.phone = input.phone;
      if (input.industry && !match.industry) patch.industry = input.industry;
      if (input.pain_points && input.pain_points.length > 0 && !(match.pain_points && match.pain_points.length > 0)) {
        patch.pain_points = input.pain_points;
      }
      if (input.intent_score != null && match.intent_score == null) patch.intent_score = input.intent_score;
      if (input.name && input.name.trim().length > (match.name?.trim().length ?? 0)) patch.name = input.name;

      if (Object.keys(patch).length === 0) {
        // Nothing new to add — return the existing lead as-is without an empty/no-op UPDATE call.
        return { row: match as LeadRow, isDuplicate: true };
      }

      const { data, error } = await supabase
        .schema('public')
        .from('leads')
        .update(patch)
        .eq('id', match.id)
        .select('*')
        .single();

      if (error || !data) {
        throw new LeadInsertError(error?.message || 'Failed to update duplicate lead');
      }
      return { row: data as LeadRow, isDuplicate: true };
    }
  }

  const { data, error } = await supabase
    .schema('public')
    .from('leads')
    .insert(input)
    .select('*')
    .single();

  if (error || !data) {
    throw new LeadInsertError(error?.message || 'Failed to create lead');
  }

  return { row: data as LeadRow, isDuplicate: false };
}

export async function incrementBotUsageCount(bot: BotConfigRow): Promise<void> {
  const nextUsageCount = Number(bot.usage_count ?? 0) + 1;
  const { error } = await supabase
    .from('bots')
    .update({ usage_count: nextUsageCount })
    .eq('id', bot.id);

  if (error) {
    throw new Error(error.message || 'Failed to update usage count');
  }
}

export async function activateBot(botId: string): Promise<void> {
  const { error } = await supabase
    .from('bots')
    .update({ is_active: true, status: 'active', stripe_status: 'active', suspended_at: null, payment_failed_at: null })
    .eq('id', botId);

  if (error) {
    throw new Error(error.message || 'Failed to activate bot');
  }
}

export async function deactivateBot(botId: string, reason: 'canceled' | 'suspended' | 'past_due'): Promise<void> {
  const update: Record<string, unknown> = {
    is_active: false,
    status: reason,
    stripe_status: reason,
  };
  if (reason === 'canceled') {
    update.canceled_at = new Date().toISOString();
  } else if (reason === 'suspended') {
    update.suspended_at = new Date().toISOString();
  } else if (reason === 'past_due') {
    update.payment_failed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('bots').update(update).eq('id', botId);
  if (error) throw new Error(error.message || 'Failed to deactivate bot');
}

export async function updateBotStripeIds(botId: string, subscriptionId: string, customerId: string): Promise<void> {
  const { error } = await supabase
    .from('bots')
    .update({ stripe_subscription_id: subscriptionId, stripe_customer_id: customerId })
    .eq('id', botId);

  if (error) throw new Error(error.message || 'Failed to update Stripe IDs');
}

export async function getBotByStripeSubscriptionId(subscriptionId: string): Promise<BotConfigRow | null> {
  const { data } = await supabase
    .from('bots')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  return (data as BotConfigRow) ?? null;
}

export async function getBotByStripeCustomerId(customerId: string): Promise<BotConfigRow | null> {
  const { data } = await supabase
    .from('bots')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();

  return (data as BotConfigRow) ?? null;
}
