-- Migration 011: Add missing plan column to bots table
-- SAFE: ADD COLUMN IF NOT EXISTS — zero risk to existing data

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS plan text;

-- Back-fill: mark existing active bots as 'pro', pending as 'starter'
UPDATE public.bots
SET plan = CASE WHEN status = 'active' THEN 'pro' ELSE 'starter' END
WHERE plan IS NULL;

COMMENT ON COLUMN public.bots.plan IS 'Subscription plan: starter | pro';
