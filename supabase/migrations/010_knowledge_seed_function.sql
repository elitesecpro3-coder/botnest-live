-- Migration 010: Utility functions for the knowledge and memory systems
-- SAFE: Functions and triggers only.

-- Upsert conversation: get existing active session or create new one
CREATE OR REPLACE FUNCTION public.upsert_conversation(
  p_bot_id    uuid,
  p_session_id text
)
RETURNS public.conversations
LANGUAGE plpgsql AS $$
DECLARE
  v_conv public.conversations;
BEGIN
  -- Try to find existing active conversation
  SELECT * INTO v_conv
  FROM public.conversations
  WHERE bot_id = p_bot_id
    AND session_id = p_session_id
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.conversations (bot_id, session_id)
    VALUES (p_bot_id, p_session_id)
    RETURNING * INTO v_conv;
  END IF;

  RETURN v_conv;
END;
$$;

-- Increment conversation turn count and update timestamp
CREATE OR REPLACE FUNCTION public.increment_conversation_turns(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE sql AS $$
  UPDATE public.conversations
  SET turn_count = turn_count + 1, updated_at = now()
  WHERE id = p_conversation_id;
$$;

-- Update discovered signals on conversation
CREATE OR REPLACE FUNCTION public.update_conversation_discovered(
  p_conversation_id uuid,
  p_discovered      jsonb
)
RETURNS void
LANGUAGE sql AS $$
  UPDATE public.conversations
  SET discovered = p_discovered, updated_at = now()
  WHERE id = p_conversation_id;
$$;

-- Get recent messages for a conversation (for sliding window context)
CREATE OR REPLACE FUNCTION public.get_recent_messages(
  p_conversation_id uuid,
  p_limit           int DEFAULT 20
)
RETURNS TABLE (
  role    text,
  content text
)
LANGUAGE sql STABLE AS $$
  SELECT role, content
  FROM (
    SELECT role, content, created_at
    FROM public.messages
    WHERE conversation_id = p_conversation_id
      AND role IN ('user', 'assistant')
    ORDER BY created_at DESC
    LIMIT p_limit
  ) sub
  ORDER BY created_at ASC;
$$;
