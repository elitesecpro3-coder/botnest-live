-- Per-bot approved widget domains.
--
-- Additive and backward compatible:
--   * '{}' (the default) means "legacy bot": the API keeps its previous behavior (global FRONTEND_ORIGINS).
--   * A non-empty array restricts the public widget endpoints (config, chat, lead) to those hosts.
--
-- Entries are host names, matched exactly and case-insensitively (scheme, port, path ignored):
--   example.com, www.example.com, localhost, 127.0.0.1, preview-name.vercel.app
-- Subdomains are never implied. A wildcard must be written explicitly: *.example.com
--
-- Adding a NOT NULL column with a constant default is a metadata-only change on PostgreSQL 11+
-- (no table rewrite). Existing rows read as '{}'. Nothing is dropped, altered or backfilled.

alter table public.bots
  add column if not exists allowed_domains text[] not null default '{}'::text[];

comment on column public.bots.allowed_domains is
  'Approved host names for the public widget. Empty = unrestricted legacy bot. Exact host match; wildcard only as *.example.com. Server-side only; never returned to browsers.';
