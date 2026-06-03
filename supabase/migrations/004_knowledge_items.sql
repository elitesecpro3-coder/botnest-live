-- Migration 004: Knowledge base with vector embeddings (RAG)
-- SAFE: New table. Requires migration 001 (pgvector).
-- Embedding model: text-embedding-3-small (1536 dimensions)

CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       uuid NOT NULL,          -- references bots.id
  type         text NOT NULL DEFAULT 'info',
  -- type values: faq | service | pricing | policy | promotion | info
  title        text NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536),           -- populated async after insert
  metadata     jsonb NOT NULL DEFAULT '{}',
  -- metadata: { tags: string[], language: string, priority: int }
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- IVFFlat index for approximate nearest-neighbor search
-- lists = 100 is appropriate for up to ~1M rows; adjust for larger sets
CREATE INDEX IF NOT EXISTS knowledge_items_embedding_idx
  ON public.knowledge_items
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS knowledge_items_bot_id_idx ON public.knowledge_items (bot_id);
CREATE INDEX IF NOT EXISTS knowledge_items_type_idx ON public.knowledge_items (bot_id, type);

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.knowledge_items
  USING (true) WITH CHECK (true);

-- Function: semantic knowledge search (called from API with pre-computed embedding)
CREATE OR REPLACE FUNCTION public.search_knowledge(
  p_bot_id    uuid,
  p_embedding vector(1536),
  p_type      text DEFAULT NULL,
  p_limit     int  DEFAULT 5
)
RETURNS TABLE (
  id           uuid,
  type         text,
  title        text,
  content      text,
  metadata     jsonb,
  similarity   float
)
LANGUAGE sql STABLE AS $$
  SELECT
    ki.id,
    ki.type,
    ki.title,
    ki.content,
    ki.metadata,
    1 - (ki.embedding <=> p_embedding) AS similarity
  FROM public.knowledge_items ki
  WHERE ki.bot_id = p_bot_id
    AND ki.is_active = true
    AND ki.embedding IS NOT NULL
    AND (p_type IS NULL OR ki.type = p_type)
  ORDER BY ki.embedding <=> p_embedding
  LIMIT p_limit;
$$;
