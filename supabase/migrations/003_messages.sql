-- Migration 003: Persistent message history
-- SAFE: New table. Replaces client-side history management.

CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content          text NOT NULL,
  tool_call        jsonb,          -- { name: string, input: object, output: object }
  tokens_used      int,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.messages
  USING (true) WITH CHECK (true);
