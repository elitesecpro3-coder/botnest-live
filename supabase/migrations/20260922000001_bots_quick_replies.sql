-- Per-bot widget quick-reply buttons.
--
-- Additive and backward compatible:
--   * NULL (the default) means "legacy bot": the widget falls back to its built-in defaults
--     (Book a Demo — only when the bot has a booking_link — View Services, Ask Anything).
--   * A non-null JSON array of { label, message?, action? } overrides those defaults entirely.
--     action is one of 'book' | 'services' | 'ask'; omitted = send `message` (or `label`) as a
--     normal chat message.
--
-- Adding a nullable column with no default is a metadata-only change on PostgreSQL (no table
-- rewrite, no backfill). Existing rows read as NULL.

alter table public.bots
  add column if not exists quick_replies jsonb null;

comment on column public.bots.quick_replies is
  'Optional per-bot widget quick-reply buttons: JSON array of {label, message?, action?}. NULL = widget default buttons.';
