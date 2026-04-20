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
};

export type CreateBotConfigInput = {
  id?: string;
  user_id: string;
  business_name: string;
  website?: string | null;
  tone?: string;
  booking_link?: string | null;
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
  name: string;
  phone?: string | null;
  email?: string | null;
  source: string;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

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

export class UsageIncrementConflictError extends Error {
  constructor(botId: string) {
    super(`Usage counter was updated concurrently for bot: ${botId}`);
    this.name = 'UsageIncrementConflictError';
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

  return data as BotConfigRow;
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

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const { data, error } = await supabase
    .schema('public')
    .from('leads')
    .insert(input)
    .select('*')
    .single();

  if (error || !data) {
    throw new LeadInsertError(error?.message || 'Failed to create lead');
  }

  return data as LeadRow;
}

export async function incrementBotUsageCount(botId: string, currentUsageCount: number): Promise<number> {
  const nextUsageCount = currentUsageCount + 1;
  const usageFilter = currentUsageCount === 0
    ? 'usage_count.eq.0,usage_count.is.null'
    : `usage_count.eq.${currentUsageCount}`;

  const { data, error } = await supabase
    .from('bots')
    .update({ usage_count: nextUsageCount })
    .eq('id', botId)
    .or(usageFilter)
    .select('usage_count')
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to update usage count');
  }

  if (!data) {
    throw new UsageIncrementConflictError(botId);
  }

  const value = Number((data as { usage_count?: number | null }).usage_count ?? nextUsageCount);
  return Number.isFinite(value) ? value : nextUsageCount;
}
