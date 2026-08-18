/**
 * Site Type Classifier
 *
 * Runs before scoring to classify the site into a business category.
 * The category controls scoring weights — so that "no booking link" is a
 * serious deficiency for a dental practice but irrelevant for Wikipedia.
 *
 * Classification is heuristic/signal-based. When uncertain, defaults to
 * 'unknown', which applies moderate weights across all categories.
 */

import type { SiteSignals } from './extractor';

export type SiteCategory =
  | 'local_service'        // Plumbing, cleaning, landscaping, pest control, etc.
  | 'appointment_business' // Med spas, salons, massage, personal training
  | 'home_services'        // HVAC, roofing, electrical, remodeling — urgent/emergency angle
  | 'medical_dental'       // Dental, medical, chiropractic, physical therapy
  | 'legal'                // Law firms, attorneys
  | 'ecommerce'            // Online store — products, checkout
  | 'saas_tech'            // Software, SaaS, tech platforms, developer tools
  | 'informational'        // Blogs, wikis, educational content, non-commercial
  | 'directory_platform'   // Yelp, Angi, directory sites
  | 'unknown';             // Fallback

export type ClassificationResult = {
  category: SiteCategory;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];          // human-readable list of what triggered the category
  isBotNestProspect: boolean; // is this the kind of business BotNest actually sells to?
  prospectNotes: string;      // why or why not
};

// ── Keyword banks ─────────────────────────────────────────────────────────────

const HOME_SERVICES_KW = [
  'hvac', 'air condition', 'heating', 'furnace', 'plumb', 'drain', 'sewer',
  'electrical', 'electrician', 'roofing', 'roofer', 'gutter', 'siding',
  'pest control', 'exterminator', 'termite', 'landscap', 'lawn care', 'tree service',
  'tree removal', 'irrigation', 'sprinkler', 'pool service', 'pool repair',
  'window cleaning', 'pressure wash', 'power wash', 'junk removal', 'moving company',
  'garage door', 'locksmith', 'foundation repair', 'waterproofing', 'mold remediation',
  'restoration', 'emergency repair', '24/7 service', 'same.day service',
];

const MEDICAL_DENTAL_KW = [
  'dental', 'dentist', 'orthodont', 'periodont', 'endodont', 'oral surgery',
  'medical', 'physician', 'doctor', 'clinic', 'urgent care', 'family medicine',
  'chiropractic', 'chiropractor', 'physical therapy', 'physiotherapy',
  'optometry', 'optometrist', 'eye care', 'dermatology', 'dermatologist',
  'psychology', 'therapist', 'counseling', 'mental health',
  'audiology', 'hearing aid', 'podiatry', 'podiatrist',
];

const APPOINTMENT_BUSINESS_KW = [
  'med spa', 'medspa', 'medical spa', 'botox', 'filler', 'laser', 'skin care',
  'aesthetics', 'esthetic', 'facial', 'microneedling', 'coolsculpting',
  'salon', 'hair salon', 'barber', 'nail salon', 'nail studio', 'lash',
  'brow', 'wax', 'threading', 'spa', 'massage', 'massage therapy',
  'personal training', 'personal trainer', 'fitness studio', 'yoga studio',
  'pilates', 'barre', 'crossfit', 'gym', 'acupuncture', 'tattoo', 'piercing',
  'pet grooming', 'dog grooming', 'veterinary', 'vet clinic',
];

const LOCAL_SERVICE_KW = [
  'cleaning service', 'maid service', 'house cleaning', 'janitorial',
  'carpet cleaning', 'upholstery cleaning', 'auto detailing', 'car wash',
  'auto repair', 'mechanic', 'towing', 'handyman', 'home repair',
  'painting', 'painter', 'flooring', 'tile', 'cabinet', 'countertop',
  'photography', 'photographer', 'videography', 'catering', 'event planning',
  'tutoring', 'music lesson', 'driving school', 'daycare', 'childcare',
  'accountant', 'bookkeeping', 'tax preparation', 'insurance agent',
  'real estate agent', 'realtor', 'property management',
];

const LEGAL_KW = [
  'attorney', 'lawyer', 'law firm', 'law office', 'legal service',
  'personal injury', 'family law', 'divorce', 'criminal defense',
  'estate planning', 'bankruptcy', 'immigration', 'workers comp',
  'litigation', 'counsel', 'esquire', 'bar association',
];

const ECOMMERCE_KW = [
  'add to cart', 'shopping cart', 'checkout', 'shop now', 'buy now',
  'free shipping', 'order online', 'product', 'collection', 'sale',
  'in stock', 'out of stock', 'quantity', 'sku', 'wishlist',
];

const SAAS_TECH_KW = [
  'software', 'platform', 'api', 'integration', 'developer', 'sdk',
  'saas', 'cloud', 'dashboard', 'analytics', 'deploy', 'deployment',
  'pricing plan', 'monthly plan', 'annual plan', 'enterprise plan',
  'free trial', 'start for free', 'open source', 'github',
  'documentation', 'getting started', 'install', 'npm install',
  'product updates', 'changelog', 'workflow', 'automation platform',
];

const INFORMATIONAL_KW = [
  'encyclopedia', 'wiki', 'nonprofit', 'foundation', 'research',
  'university', 'college', 'education', 'library', 'museum',
  'government', '.gov', '.edu', 'donate', 'mission statement',
  'news', 'journalism', 'press', 'media',
];

const DIRECTORY_KW = [
  'find a pro', 'find a professional', 'find contractors', 'list your business',
  'claim your listing', 'write a review', 'browse categories',
  'search results', 'filter by', 'sort by rating',
  'find pros near', 'hire a pro', 'find local pros',
  'get matched', 'read reviews', 'compare pros',
];

// ── Classifier ────────────────────────────────────────────────────────────────

function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

export function classifySite(signals: SiteSignals): ClassificationResult {
  const pageText = [
    signals.title || '',
    signals.metaDescription || '',
    ...signals.h1s,
    ...signals.h2s,
    ...signals.h3s,
  ].join(' ');

  const url = signals.finalUrl.toLowerCase();
  const triggered: string[] = [];

  // Score each category
  const rawScores: Record<SiteCategory, number> = {
    home_services: scoreKeywords(pageText, HOME_SERVICES_KW),
    medical_dental: scoreKeywords(pageText, MEDICAL_DENTAL_KW),
    appointment_business: scoreKeywords(pageText, APPOINTMENT_BUSINESS_KW),
    local_service: scoreKeywords(pageText, LOCAL_SERVICE_KW),
    legal: scoreKeywords(pageText, LEGAL_KW),
    ecommerce: scoreKeywords(pageText, ECOMMERCE_KW),
    saas_tech: scoreKeywords(pageText, SAAS_TECH_KW),
    informational: scoreKeywords(pageText, INFORMATIONAL_KW),
    directory_platform: scoreKeywords(pageText, DIRECTORY_KW),
    unknown: 0,
  };

  // Priority boost: service categories beat ecommerce/saas when close
  // This prevents "shop now" or "order now" in a navigation menu from mis-classifying
  // a plumbing company as ecommerce, or a dental practice as a store.
  const SERVICE_PRIORITY: Partial<Record<SiteCategory, number>> = {
    home_services:        3,
    medical_dental:       3,
    appointment_business: 3,
    local_service:        2,
    legal:                2,
  };

  const scores: Record<SiteCategory, number> = Object.fromEntries(
    (Object.entries(rawScores) as [SiteCategory, number][]).map(
      ([k, v]) => [k, v + (SERVICE_PRIORITY[k as SiteCategory] || 0)],
    ),
  ) as Record<SiteCategory, number>;

  // Hard URL-based signals (high confidence overrides)
  if (/\.gov|\.edu/.test(url)) {
    triggered.push('Government or educational domain (.gov/.edu)');
    return {
      category: 'informational',
      confidence: 'high',
      signals: triggered,
      isBotNestProspect: false,
      prospectNotes: 'Government or educational institution — not a BotNest target.',
    };
  }

  // Known directory/aggregator domains — hard override
  if (/\bangi\.com\b|\bhomeadvisor\.com\b|\bthumbtack\.com\b|\bhouzz\.com\b|\bankgi\.com\b|\byelp\.com\b|\btripadvisor\.com\b/.test(url)) {
    triggered.push('Known directory/aggregator platform domain');
    return {
      category: 'directory_platform',
      confidence: 'high',
      signals: triggered,
      isBotNestProspect: false,
      prospectNotes: 'Directory/aggregator platform — not an end-service-provider. Not a BotNest prospect.',
    };
  }

  // Known SaaS/tech domains — hard override to prevent mis-classification
  if (/\bvercel\.com\b|\bnetlify\.com\b|\bgithub\.com\b|\bhubspot\.com\b|\bsalesforce\.com\b/.test(url)) {
    triggered.push('Known SaaS/tech platform domain');
    return {
      category: 'saas_tech',
      confidence: 'high',
      signals: triggered,
      isBotNestProspect: false,
      prospectNotes: 'SaaS/technology platform — not a local service business.',
    };
  }

  // Find the winning category
  const sorted = (Object.entries(scores) as [SiteCategory, number][])
    .filter(([k]) => k !== 'unknown')
    .sort(([, a], [, b]) => b - a);

  const [topCategory, topScore] = sorted[0];
  const [, secondScore] = sorted[1] || ['unknown', 0];

  // If no meaningful signals at all, try to detect via URL/domain patterns
  if (topScore === 0) {
    // SaaS often has pricing pages, feature lists — check for booking/scheduling platforms
    if (signals.hasAppointmentScheduler && signals.schedulerPlatform) {
      triggered.push(`Appointment scheduler detected (${signals.schedulerPlatform})`);
    }

    // If the site is enterprise-looking with no local signals
    if (!signals.hasPhoneInHeader && !signals.phoneNumbers.length && signals.pageWeightKb > 100) {
      triggered.push('No phone number, large page — likely non-local commercial site');
      return {
        category: 'saas_tech',
        confidence: 'low',
        signals: triggered,
        isBotNestProspect: false,
        prospectNotes: 'No local service signals detected. Could be SaaS, media, or platform — not a typical BotNest prospect without further context.',
      };
    }

    triggered.push('No category signals matched');
    return {
      category: 'unknown',
      confidence: 'low',
      signals: triggered,
      isBotNestProspect: false,
      prospectNotes: 'Unable to determine business type from visible page content.',
    };
  }

  const confidence: ClassificationResult['confidence'] =
    topScore >= 3 ? 'high' :
    topScore >= 2 ? 'medium' : 'low';

  // Collect what keywords fired for explanation
  const kwBank: Record<SiteCategory, string[]> = {
    home_services: HOME_SERVICES_KW,
    medical_dental: MEDICAL_DENTAL_KW,
    appointment_business: APPOINTMENT_BUSINESS_KW,
    local_service: LOCAL_SERVICE_KW,
    legal: LEGAL_KW,
    ecommerce: ECOMMERCE_KW,
    saas_tech: SAAS_TECH_KW,
    informational: INFORMATIONAL_KW,
    directory_platform: DIRECTORY_KW,
    unknown: [],
  };
  const lower = pageText.toLowerCase();
  kwBank[topCategory].filter(kw => lower.includes(kw)).slice(0, 4).forEach(kw =>
    triggered.push(`Matched keyword: "${kw}"`),
  );

  const isBotNestProspect = [
    'local_service', 'appointment_business', 'home_services', 'medical_dental', 'legal',
  ].includes(topCategory);

  const prospectNotes = buildProspectNotes(topCategory, signals, isBotNestProspect);

  return {
    category: topCategory,
    confidence,
    signals: triggered,
    isBotNestProspect,
    prospectNotes,
  };
}

function buildProspectNotes(category: SiteCategory, signals: SiteSignals, isProspect: boolean): string {
  if (!isProspect) {
    if (category === 'saas_tech')    return 'SaaS/technology company — already has digital infrastructure. BotNest is not the right fit unless they resell to service businesses.';
    if (category === 'ecommerce')    return 'E-commerce site — lead capture needs are different from service businesses. Weak BotNest fit.';
    if (category === 'informational') return 'Informational or non-commercial site — no service-business lead capture requirements.';
    if (category === 'directory_platform') return 'Directory or platform site — not an end-service-provider. Not a BotNest prospect.';
    return 'Business type does not match BotNest target market (local/appointment-based service businesses).';
  }

  const gaps: string[] = [];
  if (!signals.hasAiChat && !signals.hasLiveChat) gaps.push('no AI/live chat');
  if (!signals.hasOnlineBooking) gaps.push('no online booking');
  if (!signals.hasContactForm) gaps.push('no contact form');
  if (!signals.hasTestimonials && !signals.hasReviewWidget) gaps.push('no social proof');

  if (gaps.length === 0) return `${categoryLabel(category)} — already has strong digital setup. May still benefit from BotNest AI automation.`;
  return `${categoryLabel(category)} with gaps: ${gaps.join(', ')}. Strong BotNest prospect.`;
}

function categoryLabel(c: SiteCategory): string {
  const labels: Record<SiteCategory, string> = {
    local_service: 'Local service business',
    appointment_business: 'Appointment-based business',
    home_services: 'Home services company',
    medical_dental: 'Medical or dental practice',
    legal: 'Legal services firm',
    ecommerce: 'E-commerce',
    saas_tech: 'SaaS/technology',
    informational: 'Informational/non-commercial',
    directory_platform: 'Directory/platform',
    unknown: 'Unknown business type',
  };
  return labels[c] || c;
}

export { categoryLabel };
