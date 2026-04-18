import { createClient } from '@supabase/supabase-js';

export type BotConfigRow = {
  id: string;
  slug?: string;
  name?: string;
  business_name?: string;
  industry?: string;
  tone?: string;
  booking_link?: string;
  services?: unknown;
  lead_capture_enabled?: boolean;
  fallback_contact?: string;
  welcome_message?: string;
  system_prompt?: string;
  prompt?: string;
};

export type CreateBotConfigInput = {
  id: string;
  business_name: string;
  industry?: string;
  tone?: string;
  booking_link?: string | null;
  welcome_message: string;
  system_prompt: string;
  fallback_contact?: string | null;
  lead_capture_enabled: boolean;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    .from('bots')
    .insert(input)
    .select('*')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      throw new DuplicateBotIdError(input.id);
    }

    throw new Error(error?.message || 'Failed to create bot');
  }

  return data as BotConfigRow;
}
