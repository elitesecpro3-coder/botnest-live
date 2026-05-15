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
