import { createClient } from '@supabase/supabase-js';
import { embedText, formatEmbeddingForPg } from './embeddings';

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

export type KnowledgeResult = {
  id: string;
  type: string;
  title: string;
  content: string;
  similarity: number;
};

export async function searchKnowledge(
  botId: string,
  query: string,
  type: string | null = null,
  limit = 5,
): Promise<KnowledgeResult[]> {
  try {
    const embedding = await embedText(query);
    const embeddingString = formatEmbeddingForPg(embedding);

    const { data, error } = await supabase.rpc('search_knowledge', {
      p_bot_id: botId,
      p_embedding: embeddingString,
      p_type: type,
      p_limit: limit,
    });

    if (error) {
      console.error('[knowledge] Search error:', error.message);
      return [];
    }

    return (data ?? []) as KnowledgeResult[];
  } catch (err) {
    console.error('[knowledge] Search failed:', err);
    return [];
  }
}

export function formatKnowledgeForContext(results: KnowledgeResult[]): string {
  if (results.length === 0) return '';

  const formatted = results
    .filter((r) => r.similarity > 0.6)
    .map((r) => `[${r.type.toUpperCase()}] ${r.title}\n${r.content}`)
    .join('\n\n');

  return formatted ? `Relevant business knowledge:\n${formatted}` : '';
}

export async function createKnowledgeItem(
  botId: string,
  type: string,
  title: string,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  // Insert first, then embed asynchronously
  const { data, error } = await supabase
    .from('knowledge_items')
    .insert({ bot_id: botId, type, title, content, metadata })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create knowledge item: ${error?.message}`);
  }

  // Embed in background — don't block the response
  void embedAndStore(data.id, `${title}\n${content}`);

  return data.id;
}

async function embedAndStore(itemId: string, text: string): Promise<void> {
  try {
    const embedding = await embedText(text);
    const embeddingString = formatEmbeddingForPg(embedding);

    await supabase
      .from('knowledge_items')
      .update({ embedding: embeddingString })
      .eq('id', itemId);
  } catch (err) {
    console.error('[knowledge] Failed to embed item:', itemId, err);
  }
}
