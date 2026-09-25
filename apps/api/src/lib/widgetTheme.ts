/**
 * Sanitizes `bots.widget_theme` and the branding columns into safe values for the browser.
 *
 * Security: colors are validated against a strict 6-digit-hex allowlist regex before ever being
 * used — no arbitrary CSS, no `url(...)`, no `expression(...)`, no keywords, nothing that isn't
 * exactly `#RRGGBB`. That makes it safe to drop straight into an inline style property. Branding
 * text is sent to the browser and rendered with `textContent` (never `innerHTML`), so it cannot
 * inject HTML even if it contained markup; the URL is restricted to http(s) so a bot can never be
 * configured to point the link at a `javascript:` URL or similar.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type WidgetTheme = {
  primary?: string;
  accent?: string;
  background?: string;
  text?: string;
};

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

/** WCAG relative luminance of a validated `#RRGGBB` color. */
function relativeLuminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two validated `#RRGGBB` colors (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// The widget always renders white text/icons on `primary` and `accent` (launcher, header, buttons),
// and `text` on `background` (the message area) — these are the pairs that must stay legible.
const MIN_CONTRAST_ON_WHITE = 3.0; // WCAG AA floor for large text / UI components
const MIN_CONTRAST_TEXT_ON_BACKGROUND = 4.5; // WCAG AA floor for normal body text

/**
 * Validates a raw `bots.widget_theme` jsonb value into a safe theme for the browser.
 * Each field is checked independently: a bad or low-contrast value drops just that field
 * (the widget's own default applies to it) rather than rejecting the whole theme.
 */
export function toWidgetTheme(value: unknown): WidgetTheme | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;

  const primary = isHexColor(raw.primary) ? raw.primary.trim().toLowerCase() : undefined;
  const accent = isHexColor(raw.accent) ? raw.accent.trim().toLowerCase() : undefined;
  const background = isHexColor(raw.background) ? raw.background.trim().toLowerCase() : undefined;
  const text = isHexColor(raw.text) ? raw.text.trim().toLowerCase() : undefined;

  const theme: WidgetTheme = {};
  if (primary && contrastRatio(primary, '#ffffff') >= MIN_CONTRAST_ON_WHITE) theme.primary = primary;
  if (accent && contrastRatio(accent, '#ffffff') >= MIN_CONTRAST_ON_WHITE) theme.accent = accent;
  if (background && text && contrastRatio(background, text) >= MIN_CONTRAST_TEXT_ON_BACKGROUND) {
    theme.background = background;
    theme.text = text;
  }
  // background/text are validated as a pair — a background without a legible text color (or vice
  // versa) is dropped entirely rather than risk unreadable text on the widget's default color.

  return Object.keys(theme).length > 0 ? theme : undefined;
}

const MAX_POWERED_BY_TEXT = 40;
const DEFAULT_POWERED_BY_TEXT = 'Powered by BotNest';
const DEFAULT_POWERED_BY_URL = 'https://bot-nest.com';

export type PoweredBy = { text: string; url: string };

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Builds the branding payload sent to the browser. Returns undefined when branding is off
 * (the default for every bot), so the widget's `if (config.poweredBy)` check simply skips
 * rendering — no extra flag needed on the client.
 */
export function toPoweredBy(showPoweredBy: unknown, textOverride: unknown, urlOverride: unknown): PoweredBy | undefined {
  if (showPoweredBy !== true) return undefined;

  const text = typeof textOverride === 'string' && textOverride.trim()
    ? textOverride.trim().slice(0, MAX_POWERED_BY_TEXT)
    : DEFAULT_POWERED_BY_TEXT;

  const url = typeof urlOverride === 'string' && urlOverride.trim() && isSafeHttpUrl(urlOverride.trim())
    ? urlOverride.trim()
    : DEFAULT_POWERED_BY_URL;

  return { text, url };
}
