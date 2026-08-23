import { createClient } from '@supabase/supabase-js';

let _sb: ReturnType<typeof createClient> | null = null;
function getSb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
const supabase = new Proxy({} as ReturnType<typeof createClient>, { get(_t, p) { return (getSb() as any)[p]; } });

export type ConversationRow = {
  id: string;
  bot_id: string;
  session_id: string;
  status: string;
  summary: string | null;
  discovered: {
    industry?: string;
    pain_points?: string[];
    intent_level?: number;
    objections?: string[];
  };
  lead_captured: boolean;
  turn_count: number;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_call?: {
    name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  } | null;
  created_at: string;
};

export async function getOrCreateConversation(
  botId: string,
  sessionId: string,
): Promise<ConversationRow> {
  const { data, error } = await supabase.rpc('upsert_conversation', {
    p_bot_id: botId,
    p_session_id: sessionId,
  });

  if (error || !data) {
    throw new Error(`Failed to upsert conversation: ${error?.message}`);
  }

  return data as ConversationRow;
}

export async function getRecentMessages(
  conversationId: string,
  limit = 20,
): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await supabase.rpc('get_recent_messages', {
    p_conversation_id: conversationId,
    p_limit: limit,
  });

  if (error) {
    console.error('[memory] Failed to fetch messages:', error.message);
    return [];
  }

  return (data ?? []) as Array<{ role: string; content: string }>;
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  toolCall?: { name: string; input: Record<string, unknown>; output: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role,
    content,
    tool_call: toolCall ?? null,
  });

  if (error) {
    console.error('[memory] Failed to append message:', error.message);
  }
}

export async function incrementTurns(conversationId: string): Promise<void> {
  await supabase.rpc('increment_conversation_turns', {
    p_conversation_id: conversationId,
  });
}

export async function updateDiscovered(
  conversationId: string,
  discovered: ConversationRow['discovered'],
): Promise<void> {
  await supabase.rpc('update_conversation_discovered', {
    p_conversation_id: conversationId,
    p_discovered: discovered,
  });
}

export async function markLeadCaptured(conversationId: string): Promise<void> {
  await supabase
    .from('conversations')
    .update({ lead_captured: true, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

export async function resolveConversation(conversationId: string): Promise<void> {
  await supabase
    .from('conversations')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

export async function logToolCall(
  conversationId: string,
  toolType: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
  status: 'success' | 'error',
  error?: string,
  durationMs?: number,
): Promise<void> {
  await supabase.from('tool_calls').insert({
    conversation_id: conversationId,
    tool_type: toolType,
    input,
    output,
    status,
    error: error ?? null,
    duration_ms: durationMs ?? null,
  });
}
