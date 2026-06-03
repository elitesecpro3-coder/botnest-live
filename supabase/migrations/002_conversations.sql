-- Migration 002: Conversation sessions
-- SAFE: New table, no existing data touched

CREATE TABLE IF NOT EXISTS public.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id           uuid NOT NULL,            -- references bots.id (existing table)
  session_id       text NOT NULL,            -- widget localStorage key
  visitor_id       text,                     -- optional device fingerprint
  channel          text NOT NULL DEFAULT 'widget',
  status           text NOT NULL DEFAULT 'active',  -- active | resolved | escalated
  summary          text,                     -- AI-generated rolling summary (updated every 5 turns)
  discovered       jsonb NOT NULL DEFAULT '{}',
  -- discovered shape: { industry: string, pain_points: string[], intent_level: int, objections: string[] }
  lead_captured    boolean NOT NULL DEFAULT false,
  turn_count       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Unique active session per bot+sessionId
CREATE UNIQUE INDEX IF NOT EXISTS conversations_bot_session_idx
  ON public.conversations (bot_id, session_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS conversations_bot_id_idx ON public.conversations (bot_id);
CREATE INDEX IF NOT EXISTS conversations_session_id_idx ON public.conversations (session_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON public.conversations (created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: service role bypasses all policies; deny anon
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.conversations
  USING (true) WITH CHECK (true);
