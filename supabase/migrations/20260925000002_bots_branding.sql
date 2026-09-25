-- Per-bot "Powered by BotNest" widget attribution.
--
-- Additive and backward compatible: show_powered_by defaults to false, so every existing bot
-- (including live production customers) keeps showing NO attribution unless a bot is explicitly
-- opted in. powered_by_text/powered_by_url are optional overrides of the default label/link;
-- leaving them null makes the widget fall back to "Powered by BotNest" / https://bot-nest.com.
--
-- This is a per-bot toggle set here, server-side, in Supabase - never edited from a customer's
-- own website. Enabling or disabling it for any bot (including turning it on for a white-label
-- or paid customer later) is a single UPDATE to that bot's row; it requires no change to that
-- customer's site.

alter table public.bots
  add column if not exists show_powered_by boolean not null default false,
  add column if not exists powered_by_text text,
  add column if not exists powered_by_url text;

comment on column public.bots.show_powered_by is
  'Whether the widget shows a "Powered by BotNest" attribution link. Default false preserves current behavior for every existing bot.';
comment on column public.bots.powered_by_text is
  'Optional override of the attribution label. Null = "Powered by BotNest". Sanitized/length-capped server-side before being sent to the browser.';
comment on column public.bots.powered_by_url is
  'Optional override of the attribution link target. Null = https://bot-nest.com. Must be http(s); validated server-side before being sent to the browser.';
