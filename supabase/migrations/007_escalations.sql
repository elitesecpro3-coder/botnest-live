-- Migration 007: Human escalation tracking
-- SAFE: New table.

CREATE TABLE IF NOT EXISTS public.escalations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id          uuid REFERENCES public.leads(id),
  reason           text NOT NULL,
  transcript       text,               -- full conversation text at time of escalation
  status           text NOT NULL DEFAULT 'pending',  -- pending | claimed | resolved
  assigned_to      text,               -- email or team member name
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS escalations_conversation_id_idx ON public.escalations (conversation_id);
CREATE INDEX IF NOT EXISTS escalations_status_idx ON public.escalations (status, created_at DESC);

ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.escalations
  USING (true) WITH CHECK (true);
