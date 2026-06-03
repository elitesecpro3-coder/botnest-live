-- Migration 008: Tool invocation audit log
-- SAFE: New table.

CREATE TABLE IF NOT EXISTS public.tool_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tool_type        text NOT NULL,
  input            jsonb NOT NULL,
  output           jsonb,
  status           text NOT NULL DEFAULT 'pending',   -- pending | success | error
  error            text,
  duration_ms      int,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_calls_conversation_id_idx ON public.tool_calls (conversation_id);
CREATE INDEX IF NOT EXISTS tool_calls_type_idx ON public.tool_calls (tool_type, created_at DESC);

ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.tool_calls
  USING (true) WITH CHECK (true);
