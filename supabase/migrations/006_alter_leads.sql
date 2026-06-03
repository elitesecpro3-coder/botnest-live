-- Migration 006: Enrich leads table
-- SAFE: ALTER TABLE ADD COLUMN IF NOT EXISTS — additive only, zero risk to existing data.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id),
  ADD COLUMN IF NOT EXISTS industry        text,
  ADD COLUMN IF NOT EXISTS pain_points     text[],
  ADD COLUMN IF NOT EXISTS intent_score    int CHECK (intent_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'new',
  -- status: new | contacted | qualified | converted | lost
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS metadata        jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS leads_conversation_id_idx ON public.leads (conversation_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (bot_id, status);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (bot_id, created_at DESC);
