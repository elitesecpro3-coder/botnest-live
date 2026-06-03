-- Migration 009: Useful views for the dashboard and API
-- SAFE: Views only, read-only, no data modification.

-- Active conversations with latest message and lead status
CREATE OR REPLACE VIEW public.v_active_conversations AS
SELECT
  c.id,
  c.bot_id,
  c.session_id,
  c.status,
  c.turn_count,
  c.lead_captured,
  c.discovered,
  c.created_at,
  c.updated_at,
  b.business_name,
  (
    SELECT content
    FROM public.messages m
    WHERE m.conversation_id = c.id AND m.role = 'user'
    ORDER BY m.created_at DESC
    LIMIT 1
  ) AS last_user_message,
  (
    SELECT COUNT(*)
    FROM public.messages m
    WHERE m.conversation_id = c.id
  ) AS message_count
FROM public.conversations c
JOIN public.bots b ON b.id = c.bot_id
WHERE c.status = 'active';

-- Lead pipeline with conversation context
CREATE OR REPLACE VIEW public.v_leads_with_context AS
SELECT
  l.id,
  l.bot_id,
  l.name,
  l.phone,
  l.email,
  l.industry,
  l.pain_points,
  l.intent_score,
  l.status,
  l.source,
  l.created_at,
  b.business_name,
  c.turn_count AS conversation_turns,
  c.discovered AS conversation_discovered
FROM public.leads l
JOIN public.bots b ON b.id = l.bot_id
LEFT JOIN public.conversations c ON c.id = l.conversation_id
ORDER BY l.created_at DESC;

-- Bot usage summary
CREATE OR REPLACE VIEW public.v_bot_usage AS
SELECT
  b.id AS bot_id,
  b.business_name,
  b.usage_count,
  b.usage_limit,
  ROUND((b.usage_count::numeric / NULLIF(b.usage_limit, 0)) * 100, 1) AS usage_pct,
  COUNT(DISTINCT c.id) AS total_conversations,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') AS active_conversations
FROM public.bots b
LEFT JOIN public.conversations c ON c.bot_id = b.id
LEFT JOIN public.leads l ON l.bot_id = b.id
GROUP BY b.id, b.business_name, b.usage_count, b.usage_limit;
