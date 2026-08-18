/**
 * HTML Signal Extractor
 * Parses raw HTML and produces a structured SiteSignals object.
 * Uses regex-based extraction — no full DOM parser dependency.
 *
 * Signal detection is conservative and context-aware:
 * - Contact forms require name/email/phone + message/submit AND exclude pure search forms
 * - Booking links require known booking domains or explicit appointment language
 * - Testimonials require deliberate testimonial sections, not random mentions of "review"
 * - CTA intent is classified (commercial vs informational)
 */

export type SiteSignals = {
  // Basic metadata
  url: string;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  h1s: string[];
  h2s: string[];
  h3s: string[];

  // Technical
  isHttps: boolean;
  hasViewportMeta: boolean;
  hasCanonical: boolean;
  hasStructuredData: boolean;
  pageWeightKb: number;
  responseTimeMs: number;
  statusCode: number;
  redirectCount: number;

  // Contact / conversion signals
  phoneNumbers: string[];
  emails: string[];
  hasCta: boolean;
  ctaTexts: string[];
  ctaIntent: 'commercial' | 'informational' | 'mixed' | 'none';
  hasContactForm: boolean;      // true only for genuine lead/contact forms (NOT search)
  hasSearchForm: boolean;       // explicitly search forms
  hasBookingLink: boolean;      // true only for genuine appointment/booking platforms
  bookingLinks: string[];
  hasLiveChat: boolean;
  liveChatPlatform: string | null;
  hasAiChat: boolean;
  aiChatPlatform: string | null;
  hasNewsletterForm: boolean;

  // Trust / reputation signals
  hasTestimonials: boolean;           // deliberate testimonial section
  hasThirdPartyReviews: boolean;      // Trustpilot, Google review widget, Birdeye, etc.
  hasGoogleReviewLink: boolean;       // link to Google Maps/Business listing
  hasTrustBadges: boolean;
  hasReviewWidget: boolean;
  hasCertifications: boolean;
  hasSocialProof: boolean;
  socialLinks: string[];
  hasStarRatings: boolean;

  // Automation / scheduling signals
  hasOnlineBooking: boolean;
  hasCrm: boolean;
  hasEmailMarketing: boolean;
  hasAppointmentScheduler: boolean;
  schedulerPlatform: string | null;
  hasConfirmationFlow: boolean;

  // Messaging clarity
  hasPhoneInHeader: boolean;
  hasCtaAboveFold: boolean;
  hasServiceAreaMention: boolean;
  hasValueProposition: boolean;
  bodyTextLength: number;
  hasExcessiveText: boolean;

  // Integrations detected
  detectedIntegrations: string[];

  // Images / media
  imageCount: number;
  hasAltText: boolean;

  // Forms (raw count, not interpreted)
  formCount: number;
  hasRequiredFields: boolean;

  // Internal page links discovered (for optional crawl)
  internalLinks: string[];
};

// ── Regex helpers ─────────────────────────────────────────────────────────────

function extractTag(html: string, tag: string, attr?: string): string | null {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*["']([^"']*)["'][^>]*>`, 'i');
    const m = html.match(re);
    return m ? m[1].trim() : null;
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[1]).trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>|<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`,
    'i',
  );
  const m = html.match(re);
  return m ? (m[1] || m[2] || '').trim() : null;
}

function extractAllTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text) results.push(text.slice(0, 200));
    if (results.length >= 20) break;
  }
  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLinks(html: string, base: string): { internal: string[]; external: string[] } {
  const re = /href\s*=\s*["']([^"'#?]+)["']/gi;
  const internal: Set<string> = new Set();
  const external: Set<string> = new Set();
  let baseHost: string;
  try {
    baseHost = new URL(base).hostname;
  } catch {
    baseHost = '';
  }
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const abs = new URL(href, base).href;
      const host = new URL(abs).hostname;
      if (host === baseHost) internal.add(abs);
      else external.add(abs);
    } catch { /* skip unresolvable */ }
    if (internal.size + external.size > 200) break;
  }
  return { internal: Array.from(internal).slice(0, 50), external: Array.from(external).slice(0, 50) };
}

function findPhoneNumbers(text: string): string[] {
  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = phoneRe.exec(text)) !== null) {
    found.add(m[0].trim());
    if (found.size >= 5) break;
  }
  return Array.from(found);
}

function findEmails(text: string): string[] {
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = emailRe.exec(text)) !== null) {
    const email = m[0].toLowerCase();
    if (!email.includes('example.') && !email.includes('@sentry') && !email.includes('@w3')) {
      found.add(email);
    }
    if (found.size >= 5) break;
  }
  return Array.from(found);
}

// ── Commercial CTA keywords (intent: converting a visitor to a lead/customer)
const COMMERCIAL_CTA_KW = [
  'get a quote', 'free quote', 'book now', 'book a', 'schedule now',
  'schedule a', 'call now', 'call us', 'request a call', 'request an appointment',
  'free consultation', 'get in touch', 'contact us', 'get started',
  'claim', 'reserve', 'appointment', 'estimate', 'get my',
];

// ── Informational CTA keywords (navigation/content, not lead-gen)
const INFORMATIONAL_CTA_KW = [
  'learn more', 'read more', 'see more', 'view all', 'explore',
  'sign up', 'start now', 'try free', 'watch', 'download', 'subscribe',
  'get started', 'order now', 'shop now',
];

// ── Known commercial booking/scheduling platforms only
// We require actual platform URLs, not just the word "book" in a link
const BOOKING_DOMAINS = [
  'calendly.com', 'acuityscheduling.com', 'booksy.com', 'square.site',
  'vagaro.com', 'mindbodyonline.com', 'schedulicity.com', 'janeapp.com',
  'opentable.com', 'zocdoc.com', 'housecallpro.com', 'serviceautopilot.com',
  'jobber.com', 'simplybook.me', 'setmore.com', 'hubspot.com/meetings',
  'tidycal.com', 'zcal.co', 'appointlet.com', 'oncehub.com',
  'squareup.com/appointments', 'fresha.com',
];

// ── Phrase patterns that indicate a real booking flow (not just a Wikipedia link)
// Must appear in link text OR as explicit page language near a link
const BOOKING_INTENT_PHRASES = [
  'book an appointment', 'book a service', 'book a consultation',
  'schedule an appointment', 'schedule a service', 'schedule a visit',
  'request an appointment', 'make an appointment', 'make a reservation',
  'reserve your spot', 'book your', 'schedule your',
];

const LIVE_CHAT_SIGNALS: Record<string, string> = {
  'tawk.to': 'Tawk.to',
  'intercom': 'Intercom',
  'drift': 'Drift',
  'crisp.chat': 'Crisp',
  'freshchat': 'Freshchat',
  'zendesk': 'Zendesk',
  'tidio': 'Tidio',
  'livechat': 'LiveChat',
  'olark': 'Olark',
  'smartsupp': 'Smartsupp',
  'jivochat': 'JivoChat',
  'hubspot': 'HubSpot Chat',
  'purechat': 'Pure Chat',
  'chatra': 'Chatra',
};

const AI_CHAT_SIGNALS: Record<string, string> = {
  'botnest': 'BotNest',
  'chatgpt': 'ChatGPT Widget',
  'manychat': 'ManyChat',
  'chatfuel': 'Chatfuel',
  'botpress': 'Botpress',
  'dialogflow': 'Dialogflow',
  'voiceflow': 'Voiceflow',
  'landbot': 'Landbot',
  'typebot': 'Typebot',
  'customgpt': 'CustomGPT',
  'gpt-4': 'OpenAI GPT Widget',
};

const SCHEDULER_SIGNALS: Record<string, string> = {
  'calendly': 'Calendly',
  'acuityscheduling': 'Acuity Scheduling',
  'booksy': 'Booksy',
  'vagaro': 'Vagaro',
  'mindbody': 'Mindbody',
  'schedulicity': 'Schedulicity',
  'janeapp': 'Jane App',
  'zocdoc': 'ZocDoc',
  'housecallpro': 'HouseCall Pro',
  'jobber': 'Jobber',
  'setmore': 'Setmore',
  'simplybook': 'SimplyBook',
  'fresha': 'Fresha',
};

const INTEGRATION_SIGNALS: Record<string, string> = {
  'google-analytics': 'Google Analytics',
  'gtag': 'Google Tag Manager',
  'googletagmanager': 'Google Tag Manager',
  'fbq': 'Meta Pixel',
  'facebook.net/en_US/fbevents': 'Meta Pixel',
  'hotjar': 'Hotjar',
  'clarity.ms': 'Microsoft Clarity',
  'mailchimp': 'Mailchimp',
  'klaviyo': 'Klaviyo',
  'hubspotutk': 'HubSpot',
  'activecampaign': 'ActiveCampaign',
  'infusionsoft': 'Keap/Infusionsoft',
  'stripe.com/v3': 'Stripe',
  'paypal': 'PayPal',
  'square': 'Square Payments',
  'servicetitan': 'ServiceTitan',
  'housecallpro': 'HouseCall Pro',
  'jobber': 'Jobber',
};

const SERVICE_AREA_KEYWORDS = [
  'serving', 'service area', 'located in', 'based in', 'near me',
  'county', 'metro', 'greater', 'neighborhood', 'district',
  // city/state detectors without triggering on Wikipedia's "city" article links
];

// ── Form classifier ───────────────────────────────────────────────────────────

type FormType = 'contact' | 'search' | 'newsletter' | 'login' | 'payment' | 'other';

function classifyForm(formHtml: string): FormType {
  const fl = formHtml.toLowerCase();

  // Search forms: short, no message field, has search/query input
  const hasSearchInput = /type\s*=\s*["']search["']|name\s*=\s*["'](q|query|search|s|term)["']|placeholder\s*=\s*["'][^"']*search[^"']*["']/i.test(formHtml);
  const hasSearchButton = /\b(search|find|go|lookup)\b/.test(fl) && !fl.includes('submit');
  const fieldCount = (formHtml.match(/<input[^>]+>/gi) || []).length;

  if (hasSearchInput || (hasSearchButton && fieldCount <= 2)) return 'search';

  // Login forms: password field, username
  if (/type\s*=\s*["']password["']/i.test(formHtml) && fieldCount <= 3) return 'login';

  // Newsletter: only email field, explicit subscribe
  if ((fl.includes('newsletter') || fl.includes('subscribe')) && fieldCount <= 2) return 'newsletter';

  // Payment: card number signals
  if (/card.number|credit.card|billing/i.test(formHtml)) return 'payment';

  // Contact: has name or phone or message, plus submit, but NOT a search form
  const hasNameField = /name\s*=\s*["'][^"']*(name|fname|lname|full)[^"']*["']|placeholder\s*=\s*["'][^"']*(your name|full name)[^"']*["']/i.test(formHtml);
  const hasPhoneField = /name\s*=\s*["'][^"']*phone[^"']*["']|type\s*=\s*["']tel["']|placeholder\s*=\s*["'][^"']*phone[^"']*["']/i.test(formHtml);
  const hasMessageField = /name\s*=\s*["'][^"']*(message|msg|comment|description|inquiry)[^"']*["']|<textarea/i.test(formHtml);
  const hasEmailField = /type\s*=\s*["']email["']|name\s*=\s*["'][^"']*email[^"']*["']/i.test(formHtml);
  const hasSubmit = /type\s*=\s*["']submit["']|<button[^>]*>[\s\S]*?<\/button>/i.test(formHtml);

  if (hasSubmit && (hasNameField || hasPhoneField || hasMessageField) && (hasEmailField || hasPhoneField)) {
    return 'contact';
  }

  return 'other';
}

// ── Booking link detector (strict) ───────────────────────────────────────────

function detectBookingLinks(html: string, externalLinks: string[]): { hasBookingLink: boolean; bookingLinks: string[] } {
  const found: string[] = [];

  // 1. Known booking platform URLs in the link set
  for (const link of externalLinks) {
    if (BOOKING_DOMAINS.some(d => link.toLowerCase().includes(d))) {
      found.push(link);
    }
  }

  // 2. Known scheduling platform names in script/embed code (not just link text)
  const lower = html.toLowerCase();
  for (const [signal] of Object.entries(SCHEDULER_SIGNALS)) {
    if (lower.includes(signal) && !found.some(f => f.includes(signal))) {
      found.push(`[embedded: ${signal}]`);
    }
  }

  // 3. Explicit appointment booking language (strict — not just "book" anywhere)
  // Must match multi-word phrases, not single ambiguous words
  const hasBookingPhrase = BOOKING_INTENT_PHRASES.some(phrase =>
    lower.includes(phrase.toLowerCase()),
  );

  // "book now" alone is too ambiguous (Wikipedia has "book" in article links)
  // Require either a known platform OR an explicit multi-word appointment phrase
  const hasBookingLink = found.length > 0 || hasBookingPhrase;

  return { hasBookingLink, bookingLinks: found.slice(0, 5) };
}

// ── Testimonial detector (strict) ────────────────────────────────────────────

function detectTestimonials(html: string): boolean {
  // Require a SECTION or structural element that is clearly a testimonial block,
  // not just the word "review" appearing anywhere on the page (Wikipedia has "review" in thousands of articles)

  // Pattern 1: Explicit testimonial section heading/class/ID
  const hasTestimonialSection = /class\s*=\s*["'][^"']*testimonial[^"']*["']|id\s*=\s*["'][^"']*testimonial[^"']*["']|<[^>]*testimonial[^>]*>/i.test(html);

  // Pattern 2: "What our customers/clients say" section headings
  const hasCustomerSaySection = /what (our |my )?(customers?|clients?|patients?|people) say/i.test(html);

  // Pattern 3: Multiple review-style blocks with attributed quotes
  // Look for a name attribution pattern near a quote — e.g. "— John S." or "<cite>Jane D.</cite>"
  const hasAttributedQuotes = /<(?:blockquote|cite|q)[^>]*>[\s\S]{20,300}<\/(?:blockquote|cite|q)>/i.test(html) &&
    /[—–-]\s*[A-Z][a-z]+\s|<(?:cite|strong|em)>[^<]{2,50}<\/(?:cite|strong|em)>/.test(html);

  // Pattern 4: Review widget platforms
  const hasReviewWidget = /widget\.trustpilot|elfsight|ratingwidget|reviewsig|birdeye|podium|swell\.cx|grade\.us/i.test(html);

  return hasTestimonialSection || hasCustomerSaySection || hasAttributedQuotes || hasReviewWidget;
}

// ── Third-party review detector ───────────────────────────────────────────────

function detectThirdPartyReviews(html: string): boolean {
  // Actual third-party review platforms embedded or linked to
  const patterns = [
    /widget\.trustpilot\.com/i,
    /birdeye\.com/i,
    /podium\.com/i,
    /elfsight\.com/i,
    /grade\.us/i,
    /swell\.cx/i,
    /google\.com\/maps\/place/i,   // Google Maps review link
    /g\.page\//i,                  // Short Google Business link
    /yelp\.com\/biz\//i,           // Yelp business listing link
    /angi\.com\/companylist/i,
    /houzz\.com\/professionals/i,
    /facebook\.com\/[^"']+\/reviews/i,
  ];
  return patterns.some(p => p.test(html));
}

// ── Main extractor ─────────────────────────────────────────────────────────────

export function extractSignals(html: string, fetchResult: {
  url: string;
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  redirectCount: number;
  pageWeightKb: number;
}): SiteSignals {
  const lower = html.toLowerCase();

  // ── Metadata ─────────────────────────────────────
  const title = extractTag(html, 'title') || extractMeta(html, 'og:title');
  const metaDescription = extractMeta(html, 'description') || extractMeta(html, 'og:description');
  const h1s = extractAllTags(html, 'h1');
  const h2s = extractAllTags(html, 'h2');
  const h3s = extractAllTags(html, 'h3');

  // ── Technical ────────────────────────────────────
  const isHttps = fetchResult.finalUrl.startsWith('https://');
  const hasViewportMeta = /<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html);
  const hasCanonical = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
  const hasStructuredData = lower.includes('application/ld+json') || lower.includes('schema.org');

  // ── Links ─────────────────────────────────────────
  const { internal: internalLinks, external: externalLinks } = extractLinks(html, fetchResult.finalUrl);

  // ── Contact ───────────────────────────────────────
  const plainText = stripTags(html);
  const phoneNumbers = findPhoneNumbers(html);
  const emails = findEmails(plainText);

  // ── CTA detection with intent classification ──────
  const ctaTexts: string[] = [];
  let commercialCtaCount = 0;
  let informationalCtaCount = 0;

  const buttonRe = /<(?:button|a)[^>]*>([^<]{2,80})<\/(?:button|a)>/gi;
  let bm: RegExpExecArray | null;
  while ((bm = buttonRe.exec(html)) !== null) {
    const text = stripTags(bm[1]).toLowerCase().trim();
    const isCommercial = COMMERCIAL_CTA_KW.some(kw => text.includes(kw));
    const isInformational = INFORMATIONAL_CTA_KW.some(kw => text.includes(kw));
    if (isCommercial) {
      commercialCtaCount++;
      const clean = stripTags(bm[1]).trim();
      if (!ctaTexts.includes(clean)) ctaTexts.push(clean);
    } else if (isInformational) {
      informationalCtaCount++;
    }
    if (ctaTexts.length >= 10) break;
  }

  // Also check page text for commercial CTA keywords
  const hasCommercialCtaText = COMMERCIAL_CTA_KW.some(kw => lower.includes(kw));
  const hasCta = commercialCtaCount > 0 || hasCommercialCtaText;
  const ctaIntent: SiteSignals['ctaIntent'] =
    commercialCtaCount > 0 && informationalCtaCount > 0 ? 'mixed' :
    commercialCtaCount > 0 ? 'commercial' :
    informationalCtaCount > 0 ? 'informational' :
    hasCommercialCtaText ? 'commercial' : 'none';

  // CTA above fold: first 4000 chars, commercial intent only
  const aboveFoldHtml = html.slice(0, 4000).toLowerCase();
  const hasCtaAboveFold = COMMERCIAL_CTA_KW.some(kw => aboveFoldHtml.includes(kw));

  const hasPhoneInHeader = (() => {
    const headerMatch = html.match(/<header[\s\S]*?<\/header>/i);
    if (headerMatch) return /\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(headerMatch[0]);
    const navMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
    if (navMatch) return /\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(navMatch[0]);
    return false;
  })();

  // ── Forms — classified ────────────────────────────
  const formMatches = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  const formCount = formMatches.length;
  const classifiedForms = formMatches.map(classifyForm);

  const hasContactForm = classifiedForms.includes('contact');
  const hasSearchForm = classifiedForms.includes('search');
  const hasNewsletterForm = classifiedForms.includes('newsletter');
  const hasRequiredFields = /required/i.test(html);

  // ── Booking — strict detection ────────────────────
  const { hasBookingLink, bookingLinks } = detectBookingLinks(html, externalLinks);
  const hasOnlineBooking = hasBookingLink;

  // ── Live chat ─────────────────────────────────────
  let liveChatPlatform: string | null = null;
  for (const [signal, name] of Object.entries(LIVE_CHAT_SIGNALS)) {
    if (lower.includes(signal)) { liveChatPlatform = name; break; }
  }
  const hasLiveChat = liveChatPlatform !== null;

  // ── AI chat ───────────────────────────────────────
  let aiChatPlatform: string | null = null;
  for (const [signal, name] of Object.entries(AI_CHAT_SIGNALS)) {
    if (lower.includes(signal)) { aiChatPlatform = name; break; }
  }
  const hasAiChat = aiChatPlatform !== null;

  // ── Scheduler ─────────────────────────────────────
  let schedulerPlatform: string | null = null;
  for (const [signal, name] of Object.entries(SCHEDULER_SIGNALS)) {
    if (lower.includes(signal)) { schedulerPlatform = name; break; }
  }
  const hasAppointmentScheduler = schedulerPlatform !== null || hasOnlineBooking;
  const hasConfirmationFlow = /confirmation|thank you for (booking|scheduling|your (request|inquiry))|you.{0,20}re (booked|scheduled|confirmed)/i.test(html);

  // ── Trust / reputation — strict detection ─────────
  const hasTestimonials = detectTestimonials(html);
  const hasThirdPartyReviews = detectThirdPartyReviews(html);
  const hasReviewWidget = /widget\.trustpilot|elfsight|ratingwidget|reviewsig|birdeye|podium|swell\.cx/i.test(lower);

  // Google review link: must be an actual Google Maps or Business link, not just "google" anywhere
  const hasGoogleReviewLink = /google\.com\/maps\/place|google\.com\/search\?.*reviews|g\.page\//i.test(html);

  const hasTrustBadges = /bbb\.org|angi\.com|homeadvisor\.com|thumbtack\.com|yelp\.com\/biz|licensed.*insured|insured.*bonded/i.test(html);
  const hasCertifications = /certified|certification|accredited|licensed|member of|association|nate.certified|epa.certified/i.test(html);
  const hasSocialProof = hasTestimonials || hasReviewWidget || hasThirdPartyReviews ||
    /\d{2,}\s*(5-star|five.star|google reviews?|verified reviews?)/i.test(html);
  const hasStarRatings = /★|☆|⭐|fa-star|rating.*\d\.\d|rated.*\d\.\d|\d\.\d.*stars?/i.test(html);

  const socialLinks = externalLinks.filter(l =>
    /facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|tiktok\.com/.test(l),
  ).slice(0, 6);

  // ── Integrations ──────────────────────────────────
  const detectedIntegrations: string[] = [];
  for (const [signal, name] of Object.entries(INTEGRATION_SIGNALS)) {
    if (lower.includes(signal) && !detectedIntegrations.includes(name)) {
      detectedIntegrations.push(name);
    }
  }
  const hasCrm = detectedIntegrations.some(i => ['HubSpot', 'Keap/Infusionsoft', 'ActiveCampaign'].includes(i));
  const hasEmailMarketing = detectedIntegrations.some(i => ['Mailchimp', 'Klaviyo', 'ActiveCampaign'].includes(i));

  // ── Messaging clarity ─────────────────────────────
  const bodyTextLength = plainText.length;
  const hasExcessiveText = bodyTextLength > 8000;

  // Service area: require more specific geo signals, not just "area" or "city"
  const hasServiceAreaMention =
    /serving (the )?(greater |the )?\w+ (area|metro|region)|located in \w+|based in \w+|service area:|\bnear me\b|(phoenix|atlanta|dallas|chicago|miami|houston|seattle|denver|las vegas|san diego|tampa|orlando|austin|charlotte|nashville|portland|minneapolis|detroit|cleveland|pittsburgh)\b/i.test(html);

  const hasValueProposition = h1s.length > 0 && (metaDescription !== null && metaDescription.length > 30);

  // ── Images ────────────────────────────────────────
  const imgTags = html.match(/<img[^>]+>/gi) || [];
  const imageCount = imgTags.length;
  const hasAltText = imgTags.some(img => /alt\s*=\s*["'][^"']+["']/i.test(img));

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    title,
    metaDescription,
    h1s,
    h2s,
    h3s,
    isHttps,
    hasViewportMeta,
    hasCanonical,
    hasStructuredData,
    pageWeightKb: fetchResult.pageWeightKb,
    responseTimeMs: fetchResult.responseTimeMs,
    statusCode: fetchResult.statusCode,
    redirectCount: fetchResult.redirectCount,
    phoneNumbers,
    emails,
    hasCta,
    ctaTexts,
    ctaIntent,
    hasContactForm,
    hasSearchForm,
    hasBookingLink,
    bookingLinks,
    hasLiveChat,
    liveChatPlatform,
    hasAiChat,
    aiChatPlatform,
    hasNewsletterForm,
    hasTestimonials,
    hasThirdPartyReviews,
    hasGoogleReviewLink,
    hasTrustBadges,
    hasReviewWidget,
    hasCertifications,
    hasSocialProof,
    socialLinks,
    hasStarRatings,
    hasOnlineBooking,
    hasCrm,
    hasEmailMarketing,
    hasAppointmentScheduler,
    schedulerPlatform,
    hasConfirmationFlow,
    hasPhoneInHeader,
    hasCtaAboveFold,
    hasServiceAreaMention,
    hasValueProposition,
    bodyTextLength,
    hasExcessiveText,
    detectedIntegrations,
    imageCount,
    hasAltText,
    formCount,
    hasRequiredFields,
    internalLinks,
  };
}
