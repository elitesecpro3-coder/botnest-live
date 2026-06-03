-- Migration 005: Configurable tool registry per bot
-- SAFE: New table.

CREATE TABLE IF NOT EXISTS public.tools (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id       uuid NOT NULL,         -- references bots.id
  type         text NOT NULL,
  -- type values: lead_capture | booking | checkout | escalate | knowledge_search | crm
  name         text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}',
  is_enabled   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Each bot can have at most one of each tool type
CREATE UNIQUE INDEX IF NOT EXISTS tools_bot_type_idx ON public.tools (bot_id, type);
CREATE INDEX IF NOT EXISTS tools_bot_id_idx ON public.tools (bot_id);

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.tools
  USING (true) WITH CHECK (true);

-- Seed default tools for every existing bot
-- This insert is idempotent due to ON CONFLICT DO NOTHING
INSERT INTO public.tools (bot_id, type, name, config, is_enabled)
SELECT
  id AS bot_id,
  unnest(ARRAY['lead_capture', 'booking', 'knowledge_search']) AS type,
  unnest(ARRAY['Lead Capture', 'Appointment Booking', 'Knowledge Search']) AS name,
  unnest(ARRAY[
    jsonb_build_object('require_email', false),
    jsonb_build_object('provider', 'calendly', 'url', COALESCE(booking_link, '')),
    jsonb_build_object('similarity_threshold', 0.7, 'max_results', 5)
  ]) AS config,
  true AS is_enabled
FROM public.bots
WHERE deleted_at IS NULL
ON CONFLICT (bot_id, type) DO NOTHING;
