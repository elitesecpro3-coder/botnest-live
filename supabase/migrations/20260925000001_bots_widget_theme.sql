-- Per-bot widget color theme.
--
-- Additive and backward compatible: null/absent (the default) means "legacy bot" - the widget
-- renders with its existing hardcoded colors, byte-for-byte unchanged. A bot only changes
-- appearance once BOTH this column is set AND the API's sanitizer (apps/api/src/routes/config.ts)
-- accepts the specific values - invalid or low-contrast entries are dropped per-field, never
-- applied partially in a way that breaks readability, and never returned to the browser unsanitized.
--
-- Shape (all keys optional): {"primary": "#0B1F3B", "accent": "#0071E3",
-- "background": "#FFFFFF", "text": "#172233"}. Only 6-digit hex colors are ever honored.

alter table public.bots
  add column if not exists widget_theme jsonb;

comment on column public.bots.widget_theme is
  'Optional per-bot widget color theme: {primary, accent, background, text} as 6-digit hex strings. Null = legacy default widget colors. Validated and contrast-checked server-side in routes/config.ts before being sent to the browser - never trust this column raw.';
