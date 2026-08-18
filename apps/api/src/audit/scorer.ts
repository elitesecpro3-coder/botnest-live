/**
 * Context-Aware Website Growth Scoring Engine
 *
 * Two distinct outputs:
 *   1. Website Quality Score (0-100) — how well the site functions for its type
 *   2. BotNest Opportunity Score (0-100) — how good a sales prospect this is
 *
 * Scoring weights are conditional on business type (SiteCategory).
 * A missing booking link is a serious deficiency for a dental practice
 * and completely irrelevant for Wikipedia.
 *
 * Total = 100 points across 7 categories with category weights that shift
 * based on classification. Non-applicable criteria are scored N/A and
 * excluded from the denominator so scores stay meaningful.
 */

import type { SiteSignals } from './extractor';
import type { SiteCategory, ClassificationResult } from './classifier';

export type ScoreEvidence = {
  type: 'positive' | 'negative' | 'neutral' | 'na';
  text: string;
};

export type CategoryScore = {
  name: string;
  key: string;
  score: number;
  maxScore: number;
  applicableMax: number; // actual denominator after N/A deductions
  evidence: ScoreEvidence[];
};

export type ScoreResult = {
  total: number;            // Website Quality Score 0-100
  maxTotal: number;
  grade: 'Strong' | 'Good' | 'Needs Improvement' | 'Significant Opportunity';
  categories: CategoryScore[];
  opportunityScore: number;          // BotNest sales opportunity 0-100
  opportunityLabel: 'HOT' | 'WARM' | 'LOW_PRIORITY';
  opportunityRationale: string;      // brief explanation for admin
  classification: ClassificationResult;
};

// ── Score thresholds ─────────────────────────────────────────────────────────
const THRESHOLDS = {
  strong:    85,
  good:      70,
  needsWork: 55,
};

// ── Base max scores — these are the maximums when a category is FULLY applicable
const MAX_SCORES = {
  conversion:   20,
  mobile:       15,
  performance:  15,
  leadCapture:  15,
  followUp:     10,
  reputation:   15,
  messaging:    10,
};

// ── Category applicability by site type ──────────────────────────────────────
// Multipliers: 1.0 = fully applicable, 0.5 = partially, 0.0 = not applicable
type Weights = {
  phone: number;           // is tap-to-call relevant?
  booking: number;         // is appointment booking relevant?
  contactForm: number;     // is a contact/inquiry form relevant?
  chat: number;            // is live/AI chat relevant?
  testimonials: number;    // are customer reviews/testimonials relevant?
  googleReviews: number;   // are Google reviews relevant?
  serviceArea: number;     // is local geographic area relevant?
  trustBadges: number;     // are trade/license badges relevant?
};

const CATEGORY_WEIGHTS: Record<SiteCategory, Weights> = {
  home_services: {
    phone: 1.0,    // Emergency calls are core to home services
    booking: 1.0,
    contactForm: 1.0,
    chat: 1.0,
    testimonials: 1.0,
    googleReviews: 1.0,
    serviceArea: 1.0,
    trustBadges: 1.0,
  },
  medical_dental: {
    phone: 1.0,
    booking: 1.0,   // Critical — HIPAA-aware scheduling
    contactForm: 0.8,
    chat: 0.8,
    testimonials: 1.0,
    googleReviews: 1.0,
    serviceArea: 0.8,
    trustBadges: 1.0,  // Licenses, certifications matter
  },
  appointment_business: {
    phone: 0.8,
    booking: 1.0,   // Booking IS the conversion
    contactForm: 0.7,
    chat: 0.9,
    testimonials: 1.0,
    googleReviews: 1.0,
    serviceArea: 0.6,
    trustBadges: 0.5,
  },
  local_service: {
    phone: 1.0,
    booking: 0.8,
    contactForm: 1.0,
    chat: 0.9,
    testimonials: 1.0,
    googleReviews: 1.0,
    serviceArea: 1.0,
    trustBadges: 0.8,
  },
  legal: {
    phone: 1.0,
    booking: 0.8,   // Free consultation scheduling
    contactForm: 1.0,
    chat: 0.9,
    testimonials: 0.9,
    googleReviews: 0.9,
    serviceArea: 0.7,
    trustBadges: 0.8,  // Bar associations, etc.
  },
  ecommerce: {
    phone: 0.4,
    booking: 0.1,   // Not relevant for product e-commerce
    contactForm: 0.6,
    chat: 0.8,
    testimonials: 0.8,
    googleReviews: 0.4,
    serviceArea: 0.2,
    trustBadges: 0.5,
  },
  saas_tech: {
    phone: 0.2,     // SaaS typically doesn't use phone as primary CTA
    booking: 0.3,   // Demo scheduling, not appointment booking
    contactForm: 0.7,
    chat: 0.7,
    testimonials: 0.8,
    googleReviews: 0.1,  // Google reviews not the trust mechanism for SaaS
    serviceArea: 0.0,    // Not geographically constrained
    trustBadges: 0.2,
  },
  informational: {
    phone: 0.1,
    booking: 0.0,
    contactForm: 0.3,
    chat: 0.2,
    testimonials: 0.1,
    googleReviews: 0.0,
    serviceArea: 0.0,
    trustBadges: 0.0,
  },
  directory_platform: {
    phone: 0.2,
    booking: 0.1,
    contactForm: 0.3,
    chat: 0.2,
    testimonials: 0.0,
    googleReviews: 0.0,
    serviceArea: 0.0,
    trustBadges: 0.0,
  },
  unknown: {
    phone: 0.7,
    booking: 0.5,
    contactForm: 0.7,
    chat: 0.7,
    testimonials: 0.6,
    googleReviews: 0.5,
    serviceArea: 0.5,
    trustBadges: 0.5,
  },
};

// ── Helper: only emit a finding if the weight is above a threshold ────────────
function isApplicable(weight: number): boolean { return weight >= 0.4; }

// ── 1. Conversion Design (20 pts) ─────────────────────────────────────────────
function scoreConversion(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;
  let applicableMax = MAX_SCORES.conversion;

  // CTA presence (universal)
  if (s.hasCta && (s.ctaIntent === 'commercial' || s.ctaIntent === 'mixed')) {
    score += 5;
    evidence.push({ type: 'positive', text: `Commercial call-to-action detected${s.ctaTexts.length ? `: "${s.ctaTexts[0]}"` : ''}` });
  } else if (s.hasCta && s.ctaIntent === 'informational') {
    score += 2;
    evidence.push({ type: 'neutral', text: 'CTAs present but informational only (learn more, explore) — no commercial conversion action' });
  } else {
    evidence.push({ type: 'negative', text: 'No recognizable call-to-action found' });
  }

  // CTA above fold
  if (s.hasCtaAboveFold) {
    score += 4;
    evidence.push({ type: 'positive', text: 'Commercial CTA appears above the fold' });
  } else {
    evidence.push({ type: 'negative', text: 'No commercial CTA detected above the fold — visitors must scroll to find the next step' });
  }

  // Phone number — weight-dependent
  if (isApplicable(w.phone)) {
    if (s.phoneNumbers.length > 0) {
      score += Math.round(3 * w.phone);
      evidence.push({ type: 'positive', text: `Phone number found: ${s.phoneNumbers[0]}` });
    } else {
      evidence.push({ type: 'negative', text: 'No phone number detected on the page' });
    }
    if (s.hasPhoneInHeader && s.phoneNumbers.length > 0) {
      score += Math.round(2 * w.phone);
      evidence.push({ type: 'positive', text: 'Phone number appears in site header for immediate visibility' });
    } else if (s.phoneNumbers.length > 0) {
      evidence.push({ type: 'neutral', text: 'Phone number present but not in header position' });
    }
  } else {
    // Phone not applicable — reduce max
    applicableMax -= 5;
    evidence.push({ type: 'na', text: 'Phone number: not a primary conversion method for this site type' });
  }

  // Contact form — weight-dependent
  if (isApplicable(w.contactForm)) {
    if (s.hasContactForm) {
      score += Math.round(3 * w.contactForm);
      evidence.push({ type: 'positive', text: 'Lead/contact form detected — visitors can submit inquiries' });
    } else if (s.hasSearchForm && !s.hasContactForm) {
      evidence.push({ type: 'negative', text: 'Only a search form found — no contact or lead capture form' });
    } else {
      evidence.push({ type: 'negative', text: 'No contact form — visitors must call or email directly to reach the business' });
    }
  } else {
    applicableMax -= 3;
    evidence.push({ type: 'na', text: 'Contact form: lower priority for this site type' });
  }

  // Booking — weight-dependent
  if (isApplicable(w.booking)) {
    if (s.hasBookingLink || s.hasOnlineBooking) {
      score += Math.round(3 * w.booking);
      evidence.push({ type: 'positive', text: `Online booking or appointment scheduling detected${s.bookingLinks.length && !s.bookingLinks[0].startsWith('[embedded') ? ` (${s.bookingLinks[0].replace(/https?:\/\//, '').split('/')[0]})` : ''}` });
    } else {
      evidence.push({ type: 'negative', text: 'No online booking or scheduling detected — every appointment requires manual phone/email coordination' });
    }
  } else {
    applicableMax -= 3;
    evidence.push({ type: 'na', text: 'Online booking: not applicable for this site type' });
  }

  return {
    name: 'Conversion Design',
    key: 'conversion',
    score: Math.min(score, MAX_SCORES.conversion),
    maxScore: MAX_SCORES.conversion,
    applicableMax: Math.max(applicableMax, 5),
    evidence,
  };
}

// ── 2. Mobile Experience (15 pts) ────────────────────────────────────────────
function scoreMobile(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;

  if (s.hasViewportMeta) {
    score += 7;
    evidence.push({ type: 'positive', text: 'Viewport meta tag present — site is designed to be mobile-responsive' });
  } else {
    evidence.push({ type: 'negative', text: 'No viewport meta tag — site likely not mobile-responsive, affecting the majority of visitors' });
  }

  if (s.hasCta && s.ctaIntent !== 'informational') {
    score += 3;
    evidence.push({ type: 'neutral', text: 'CTA elements present (mobile tap-target quality requires browser rendering to verify)' });
  }

  if (isApplicable(w.phone)) {
    if (s.phoneNumbers.length > 0) {
      score += 3;
      evidence.push({ type: 'positive', text: 'Phone number present — mobile visitors can tap-to-call' });
    } else {
      evidence.push({ type: 'negative', text: 'No phone number found — mobile visitors cannot tap-to-call' });
    }
  } else {
    evidence.push({ type: 'na', text: 'Tap-to-call: not a primary mobile conversion action for this site type' });
  }

  if (s.hasAltText) {
    score += 2;
    evidence.push({ type: 'positive', text: 'Images have alt text — accessibility and mobile rendering signal' });
  }

  evidence.push({ type: 'neutral', text: 'Full mobile rendering quality requires Lighthouse or browser-based testing' });

  return {
    name: 'Mobile Experience',
    key: 'mobile',
    score: Math.min(score, MAX_SCORES.mobile),
    maxScore: MAX_SCORES.mobile,
    applicableMax: MAX_SCORES.mobile,
    evidence,
  };
}

// ── 3. Performance / Technical Health (15 pts) ────────────────────────────────
function scorePerformance(s: SiteSignals): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;

  if (s.isHttps) {
    score += 5;
    evidence.push({ type: 'positive', text: 'Site uses HTTPS — secure connection, required for search ranking' });
  } else {
    evidence.push({ type: 'negative', text: 'Site does not use HTTPS — security risk and search ranking penalty' });
  }

  if (s.statusCode === 200) {
    score += 3;
    evidence.push({ type: 'positive', text: 'Server responded HTTP 200 OK' });
  } else {
    evidence.push({ type: 'negative', text: `Unexpected HTTP status: ${s.statusCode}` });
  }

  if (s.responseTimeMs < 3000) {
    score += 4;
    evidence.push({ type: 'positive', text: `Page responded in ${s.responseTimeMs}ms (fast)` });
  } else if (s.responseTimeMs < 6000) {
    score += 2;
    evidence.push({ type: 'neutral', text: `Page responded in ${s.responseTimeMs}ms (moderate — could be improved)` });
  } else {
    evidence.push({ type: 'negative', text: `Slow server response: ${s.responseTimeMs}ms — harms user experience and search ranking` });
  }

  if (s.pageWeightKb < 500) {
    score += 2;
    evidence.push({ type: 'positive', text: `Page HTML is ${s.pageWeightKb}KB (lightweight)` });
  } else if (s.pageWeightKb < 1500) {
    score += 1;
    evidence.push({ type: 'neutral', text: `Page HTML is ${s.pageWeightKb}KB (moderate size)` });
  } else {
    evidence.push({ type: 'negative', text: `Page HTML is ${s.pageWeightKb}KB (heavy HTML — external assets add further load)` });
  }

  if (s.redirectCount === 0) {
    score += 1;
    evidence.push({ type: 'positive', text: 'No redirect chain detected' });
  } else if (s.redirectCount <= 2) {
    evidence.push({ type: 'neutral', text: `${s.redirectCount} redirect(s) before final page — minor performance cost` });
  } else {
    evidence.push({ type: 'negative', text: `${s.redirectCount} redirects detected — reduces page load speed` });
  }

  if (s.hasStructuredData) {
    evidence.push({ type: 'positive', text: 'Structured data (schema.org) found — helps search engines understand the business' });
  } else {
    evidence.push({ type: 'neutral', text: 'No structured data detected — missed opportunity for rich search results' });
  }

  return {
    name: 'Performance & Technical Health',
    key: 'performance',
    score: Math.min(score, MAX_SCORES.performance),
    maxScore: MAX_SCORES.performance,
    applicableMax: MAX_SCORES.performance,
    evidence,
  };
}

// ── 4. Lead Capture (15 pts) ─────────────────────────────────────────────────
function scoreLeadCapture(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;
  let applicableMax = MAX_SCORES.leadCapture;

  // Contact form
  if (isApplicable(w.contactForm)) {
    if (s.hasContactForm) {
      score += Math.round(4 * w.contactForm);
      evidence.push({ type: 'positive', text: 'Contact/inquiry form detected — visitors can submit leads without calling' });
    } else if (s.hasSearchForm && !s.hasContactForm) {
      evidence.push({ type: 'negative', text: 'Only a site search form found — no lead capture form present' });
    } else {
      evidence.push({ type: 'negative', text: 'No lead capture form — visitors must call or email to make contact' });
    }
  } else {
    applicableMax -= 4;
    evidence.push({ type: 'na', text: 'Contact form: lower lead-capture priority for this site type' });
  }

  // Chat
  if (isApplicable(w.chat)) {
    if (s.hasAiChat) {
      score += 4;
      evidence.push({ type: 'positive', text: `AI chat assistant detected (${s.aiChatPlatform || 'platform unknown'}) — 24/7 lead qualification` });
    } else if (s.hasLiveChat) {
      score += 3;
      evidence.push({ type: 'positive', text: `Live chat detected (${s.liveChatPlatform || 'platform unknown'}) — real-time visitor engagement` });
    } else {
      // For service businesses, no chat is a real gap. For SaaS/informational, mention it gently.
      if (w.chat >= 0.7) {
        evidence.push({ type: 'negative', text: 'No live chat or AI assistant — after-hours visitors have no interactive capture path' });
      } else {
        evidence.push({ type: 'neutral', text: 'No live chat detected — may be appropriate for this site type' });
      }
    }
  } else {
    applicableMax -= 4;
    evidence.push({ type: 'na', text: 'Live/AI chat: lower priority for this site type' });
  }

  // Booking as lead capture
  if (isApplicable(w.booking)) {
    if (s.hasBookingLink || s.hasOnlineBooking) {
      score += Math.round(2 * w.booking);
      evidence.push({ type: 'positive', text: 'Booking/scheduling link detected — visitors can self-book' });
    }
  } else {
    applicableMax -= 2;
  }

  // Phone
  if (isApplicable(w.phone)) {
    if (s.phoneNumbers.length > 0) {
      score += Math.round(2 * w.phone);
      evidence.push({ type: 'positive', text: `Phone contact available: ${s.phoneNumbers[0]}` });
    } else {
      evidence.push({ type: 'negative', text: 'No phone number — no direct call path for visitors who prefer calling' });
    }
  } else {
    applicableMax -= 2;
    evidence.push({ type: 'na', text: 'Phone not a primary lead channel for this type' });
  }

  // Newsletter-only catch
  if (s.hasNewsletterForm && !s.hasContactForm && !s.hasAiChat && !s.hasLiveChat) {
    evidence.push({ type: 'negative', text: 'Only newsletter sign-up found — not a qualified lead capture mechanism' });
  }

  return {
    name: 'Lead Capture',
    key: 'leadCapture',
    score: Math.min(score, MAX_SCORES.leadCapture),
    maxScore: MAX_SCORES.leadCapture,
    applicableMax: Math.max(applicableMax, 4),
    evidence,
  };
}

// ── 5. Follow-Up / Automation Readiness (10 pts) ──────────────────────────────
function scoreFollowUp(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;

  if (isApplicable(w.booking)) {
    if (s.hasAppointmentScheduler) {
      score += 3;
      evidence.push({ type: 'positive', text: `Appointment scheduling detected${s.schedulerPlatform ? ` (${s.schedulerPlatform})` : ''} — reduces manual booking overhead` });
    } else {
      evidence.push({ type: 'negative', text: 'No appointment scheduler — every inquiry requires manual follow-up coordination' });
    }
  } else {
    evidence.push({ type: 'na', text: 'Appointment scheduler: not applicable for this site type' });
  }

  if (s.hasCrm) {
    score += 3;
    evidence.push({ type: 'positive', text: 'CRM integration detected — structured lead tracking likely in place' });
  } else {
    evidence.push({ type: 'neutral', text: 'No CRM integration detected on this page (may be internal-only)' });
  }

  if (s.hasEmailMarketing) {
    score += 2;
    evidence.push({ type: 'positive', text: 'Email marketing platform detected — automated follow-up capability exists' });
  } else {
    evidence.push({ type: 'neutral', text: 'No email marketing platform detected on this page' });
  }

  if (s.hasConfirmationFlow) {
    score += 2;
    evidence.push({ type: 'positive', text: 'Confirmation or thank-you flow signals detected' });
  } else {
    evidence.push({ type: 'neutral', text: 'No booking confirmation flow detected — unclear if inquiries are acknowledged immediately' });
  }

  evidence.push({ type: 'neutral', text: 'Follow-up automation is partially inferred from visible page signals only' });

  return {
    name: 'Follow-Up & Automation',
    key: 'followUp',
    score: Math.min(score, MAX_SCORES.followUp),
    maxScore: MAX_SCORES.followUp,
    applicableMax: MAX_SCORES.followUp,
    evidence,
  };
}

// ── 6. Reputation & Trust (15 pts) ───────────────────────────────────────────
function scoreReputation(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;
  let applicableMax = MAX_SCORES.reputation;

  // Testimonials
  if (isApplicable(w.testimonials)) {
    if (s.hasTestimonials) {
      score += Math.round(4 * w.testimonials);
      evidence.push({ type: 'positive', text: 'Customer testimonial section detected on page' });
    } else {
      evidence.push({ type: 'negative', text: 'No customer testimonials detected — visitors have no social proof from past customers' });
    }
  } else {
    applicableMax -= 4;
    evidence.push({ type: 'na', text: 'Customer testimonials: low relevance for this site type' });
  }

  // Third-party reviews / widget
  if (s.hasThirdPartyReviews || s.hasReviewWidget) {
    score += 3;
    evidence.push({ type: 'positive', text: 'Third-party review platform or review widget detected (Trustpilot, Birdeye, Podium, etc.)' });
  }

  // Google review link
  if (isApplicable(w.googleReviews)) {
    if (s.hasGoogleReviewLink) {
      score += Math.round(3 * w.googleReviews);
      evidence.push({ type: 'positive', text: 'Google Business/Maps review link found — social proof and local search trust signal' });
    } else {
      evidence.push({ type: 'negative', text: 'No Google review link — visitors cannot easily see or leave Google reviews' });
    }
  } else {
    applicableMax -= 3;
    evidence.push({ type: 'na', text: 'Google reviews: not a primary trust signal for this site type' });
  }

  // Trust badges
  if (isApplicable(w.trustBadges)) {
    if (s.hasTrustBadges) {
      score += Math.round(2 * w.trustBadges);
      evidence.push({ type: 'positive', text: 'Industry trust badges or affiliations detected (BBB, Angi, licensed, insured)' });
    }
  } else {
    applicableMax -= 2;
  }

  if (s.hasCertifications) {
    score += 2;
    evidence.push({ type: 'positive', text: 'Professional certifications or licensing references found' });
  }

  if (s.hasStarRatings) {
    score += 1;
    evidence.push({ type: 'positive', text: 'Star ratings or review scores visible on page' });
  }

  if (s.socialLinks.length > 0) {
    evidence.push({ type: 'positive', text: `Social media presence: ${s.socialLinks.length} platform(s) linked` });
  }

  if (!s.hasTestimonials && !s.hasThirdPartyReviews && !s.hasGoogleReviewLink && isApplicable(w.testimonials)) {
    evidence.push({ type: 'negative', text: 'No trust signals detected near conversion points — visitors cannot verify the business reputation' });
  }

  return {
    name: 'Reputation & Trust',
    key: 'reputation',
    score: Math.min(score, MAX_SCORES.reputation),
    maxScore: MAX_SCORES.reputation,
    applicableMax: Math.max(applicableMax, 4),
    evidence,
  };
}

// ── 7. Messaging / Clarity (10 pts) ──────────────────────────────────────────
function scoreMessaging(s: SiteSignals, w: Weights): CategoryScore {
  const evidence: ScoreEvidence[] = [];
  let score = 0;

  if (s.h1s.length > 0) {
    score += 3;
    evidence.push({ type: 'positive', text: `Primary headline (H1): "${s.h1s[0]?.slice(0, 80)}"` });
  } else {
    evidence.push({ type: 'negative', text: 'No H1 heading — unclear primary message for visitors and search engines' });
  }

  if (s.metaDescription) {
    score += 2;
    evidence.push({ type: 'positive', text: `Meta description: "${s.metaDescription.slice(0, 80)}..."` });
  } else {
    evidence.push({ type: 'negative', text: 'No meta description — missed opportunity for search result messaging' });
  }

  if (isApplicable(w.serviceArea)) {
    if (s.hasServiceAreaMention) {
      score += Math.round(2 * w.serviceArea);
      evidence.push({ type: 'positive', text: 'Geographic service area mentioned — local visitors can confirm coverage' });
    } else {
      evidence.push({ type: 'negative', text: 'No geographic service area detected — local visitors may not know if the business serves their area' });
    }
  } else {
    evidence.push({ type: 'na', text: 'Geographic service area: not relevant for this site type' });
  }

  if (s.hasValueProposition) {
    score += 2;
    evidence.push({ type: 'positive', text: 'Clear value proposition evident from headline and description' });
  } else {
    evidence.push({ type: 'negative', text: 'Value proposition unclear — what makes this business the right choice is not immediately apparent' });
  }

  if (s.hasExcessiveText) {
    evidence.push({ type: 'negative', text: 'High text volume — key information may be buried; consider condensing or restructuring' });
  } else {
    score += 1;
    evidence.push({ type: 'positive', text: 'Page text volume is reasonable' });
  }

  return {
    name: 'Messaging & Clarity',
    key: 'messaging',
    score: Math.min(score, MAX_SCORES.messaging),
    maxScore: MAX_SCORES.messaging,
    applicableMax: MAX_SCORES.messaging,
    evidence,
  };
}

// ── BotNest Opportunity Score (separate from quality score) ───────────────────
function calculateOpportunityScore(
  s: SiteSignals,
  websiteScore: number,
  classification: ClassificationResult,
): { score: number; label: 'HOT' | 'WARM' | 'LOW_PRIORITY'; rationale: string } {

  // If not a BotNest prospect category, cap at LOW_PRIORITY regardless
  if (!classification.isBotNestProspect) {
    let capScore = 0;
    const reasons: string[] = [];

    // Even non-prospects can have some signals worth noting
    if (!s.hasAiChat && !s.hasLiveChat) { capScore += 5; reasons.push('no AI/live chat'); }
    reasons.push(`site type: ${classification.category} (outside BotNest target market)`);

    return {
      score: Math.min(capScore, 29), // force LOW_PRIORITY
      label: 'LOW_PRIORITY',
      rationale: reasons.join('; '),
    };
  }

  let score = 0;
  const reasons: string[] = [];

  // Low website quality = high opportunity (more things to fix = more to sell)
  if (websiteScore < 40)      { score += 25; reasons.push('very low website score'); }
  else if (websiteScore < 60) { score += 18; reasons.push('below-average website score'); }
  else if (websiteScore < 75) { score += 8;  reasons.push('moderate website score'); }

  // Core BotNest gap signals — what we directly replace or enhance
  if (!s.hasAiChat && !s.hasLiveChat) {
    score += 18;
    reasons.push('no AI/live chat (primary BotNest value prop)');
  } else if (!s.hasAiChat && s.hasLiveChat) {
    score += 8;
    reasons.push('live chat only, no AI (upgrade opportunity)');
  }

  if (!s.hasOnlineBooking) {
    const w = CATEGORY_WEIGHTS[classification.category];
    score += Math.round(12 * w.booking);
    if (w.booking >= 0.7) reasons.push('no online booking (high-value gap for this business type)');
  }

  if (!s.hasContactForm && !s.hasLiveChat && !s.hasAiChat) {
    score += 8;
    reasons.push('no contact form or chat (all leads lost to friction)');
  }

  // Reputation gaps — Reputation Shield opportunity
  if (!s.hasThirdPartyReviews && !s.hasReviewWidget) {
    score += 6;
    reasons.push('no review platform (Reputation Shield opportunity)');
  }

  // Follow-up automation gap
  if (!s.hasCrm && !s.hasEmailMarketing) {
    score += 5;
    reasons.push('no follow-up automation detected');
  }

  // Urgency signals for home services
  if (classification.category === 'home_services') {
    score += 5;
    reasons.push('home services — emergency/after-hours AI response high value');
  }

  const capped = Math.min(score, 100);
  const label: 'HOT' | 'WARM' | 'LOW_PRIORITY' =
    capped >= 60 ? 'HOT' :
    capped >= 35 ? 'WARM' :
    'LOW_PRIORITY';

  return { score: capped, label, rationale: reasons.slice(0, 4).join('; ') };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export function scoreWebsite(signals: SiteSignals, classification: ClassificationResult): ScoreResult {
  const w = CATEGORY_WEIGHTS[classification.category];

  const rawCategories = [
    scoreConversion(signals, w),
    scoreMobile(signals, w),
    scorePerformance(signals),
    scoreLeadCapture(signals, w),
    scoreFollowUp(signals, w),
    scoreReputation(signals, w),
    scoreMessaging(signals, w),
  ];

  // Scale each category score to its applicable max, then normalize to its original max
  // This gives a fair score even when some criteria are N/A for this site type
  const categories = rawCategories.map(cat => {
    const scaledScore = cat.applicableMax > 0
      ? Math.round((cat.score / cat.applicableMax) * cat.maxScore)
      : 0;
    return { ...cat, score: Math.min(scaledScore, cat.maxScore) };
  });

  const total = Math.min(categories.reduce((sum, c) => sum + c.score, 0), 100);
  const maxTotal = Object.values(MAX_SCORES).reduce((a, b) => a + b, 0);

  const grade: ScoreResult['grade'] =
    total >= THRESHOLDS.strong    ? 'Strong' :
    total >= THRESHOLDS.good      ? 'Good' :
    total >= THRESHOLDS.needsWork ? 'Needs Improvement' :
    'Significant Opportunity';

  const opportunity = calculateOpportunityScore(signals, total, classification);

  return {
    total,
    maxTotal,
    grade,
    categories,
    opportunityScore: opportunity.score,
    opportunityLabel: opportunity.label,
    opportunityRationale: opportunity.rationale,
    classification,
  };
}
