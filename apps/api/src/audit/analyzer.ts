/**
 * AI Analysis Layer
 * Converts structured SiteSignals + ScoreResult into business-language findings,
 * executive summary, strengths, recommendations, and sales intelligence.
 *
 * Sends a compact structured representation to the LLM — never raw HTML.
 * Clearly distinguishes OBSERVED / INFERRED / UNKNOWN facts.
 */

import OpenAI from 'openai';
import type { SiteSignals } from './extractor';
import type { ScoreResult } from './scorer';
import type { ClassificationResult } from './classifier';
import { categoryLabel } from './classifier';

export type Finding = {
  title: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  business_impact: string;
  recommendation: string;
  botnest_solution: string;
  confidence: 'high' | 'medium' | 'low';
  fact_type: 'OBSERVED' | 'INFERRED';
};

export type Strength = {
  title: string;
  detail: string;
};

export type AuditAnalysis = {
  findings: Finding[];
  strengths: Strength[];
  executiveSummary: string;
  recommendations: string[];
  recommendedPackage: 'starter' | 'growth' | 'scale';
  salesAngle: string;
  metadata: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
  };
};

// ── Compact signal summary for LLM ───────────────────────────────────────────
function buildSignalSummary(signals: SiteSignals, scores: ScoreResult, businessInfo: {
  businessName: string;
  businessType: string;
  websiteUrl: string;
}, classification?: ClassificationResult): string {
  const cats = scores.categories.map(c => `  ${c.name}: ${c.score}/${c.maxScore}`).join('\n');
  const negativeEvidence = scores.categories
    .flatMap(c => c.evidence.filter(e => e.type === 'negative').map(e => `- [${c.name}] ${e.text}`))
    .join('\n');
  const positiveEvidence = scores.categories
    .flatMap(c => c.evidence.filter(e => e.type === 'positive').map(e => `+ [${c.name}] ${e.text}`))
    .join('\n');

  return `
BUSINESS: ${businessInfo.businessName}
INDUSTRY: ${businessInfo.businessType || 'Not specified'}
SITE CLASSIFICATION: ${classification ? categoryLabel(classification.category) : 'Unknown'} (${classification?.confidence || 'low'} confidence)
BOTNEST PROSPECT: ${classification?.isBotNestProspect ? 'YES' : 'NO — ' + (classification?.prospectNotes || '')}
WEBSITE: ${businessInfo.websiteUrl}
FINAL URL: ${signals.finalUrl}

WEBSITE QUALITY SCORE: ${scores.total}/100 — ${scores.grade}
BOTNEST OPPORTUNITY SCORE: ${scores.opportunityScore}/100 — ${scores.opportunityLabel}
OPPORTUNITY RATIONALE: ${scores.opportunityRationale || 'N/A'}

CATEGORY BREAKDOWN:
${cats}

PAGE METADATA:
- Title: ${signals.title || 'None detected'}
- H1: ${signals.h1s[0] || 'None detected'}
- Meta description: ${signals.metaDescription ? signals.metaDescription.slice(0, 150) : 'None'}
- Page weight: ${signals.pageWeightKb}KB
- Response time: ${signals.responseTimeMs}ms
- HTTPS: ${signals.isHttps ? 'Yes' : 'NO'}
- Viewport meta: ${signals.hasViewportMeta ? 'Yes' : 'NO'}

CONTACT SIGNALS:
- Phone numbers detected: ${signals.phoneNumbers.length > 0 ? signals.phoneNumbers.join(', ') : 'None'}
- Emails detected: ${signals.emails.length > 0 ? signals.emails.join(', ') : 'None'}
- Phone in header: ${signals.hasPhoneInHeader ? 'Yes' : 'No'}

CONVERSION SIGNALS:
- Has CTA: ${signals.hasCta ? 'Yes' : 'No'}
- CTA above fold: ${signals.hasCtaAboveFold ? 'Yes' : 'No'}
- CTA button texts: ${signals.ctaTexts.slice(0, 5).join(' | ') || 'None detected'}
- Contact form: ${signals.hasContactForm ? 'Yes' : 'No'}
- Booking link: ${signals.hasBookingLink ? 'Yes' : 'No'}
- Booking platforms: ${signals.bookingLinks.slice(0, 3).join(', ') || 'None'}

LEAD CAPTURE:
- Live chat: ${signals.hasLiveChat ? `Yes (${signals.liveChatPlatform})` : 'No'}
- AI chat: ${signals.hasAiChat ? `Yes (${signals.aiChatPlatform})` : 'No'}
- Online booking: ${signals.hasOnlineBooking ? 'Yes' : 'No'}
- Newsletter only: ${signals.hasNewsletterForm && !signals.hasContactForm && !signals.hasAiChat ? 'Yes' : 'No'}

TRUST / REPUTATION:
- Testimonials: ${signals.hasTestimonials ? 'Yes' : 'No'}
- Google review link: ${signals.hasGoogleReviewLink ? 'Yes' : 'No'}
- Trust badges: ${signals.hasTrustBadges ? 'Yes' : 'No'}
- Review widget: ${signals.hasReviewWidget ? 'Yes' : 'No'}
- Star ratings visible: ${signals.hasStarRatings ? 'Yes' : 'No'}
- Certifications: ${signals.hasCertifications ? 'Yes' : 'No'}

AUTOMATION:
- Appointment scheduler: ${signals.hasAppointmentScheduler ? `Yes (${signals.schedulerPlatform || 'platform unknown'})` : 'No'}
- CRM detected: ${signals.hasCrm ? 'Yes' : 'No'}
- Email marketing: ${signals.hasEmailMarketing ? 'Yes' : 'No'}
- Confirmation flow: ${signals.hasConfirmationFlow ? 'Yes' : 'No'}

MESSAGING:
- Service area mentioned: ${signals.hasServiceAreaMention ? 'Yes' : 'No'}
- Value proposition evident: ${signals.hasValueProposition ? 'Yes' : 'No'}
- Excessive text: ${signals.hasExcessiveText ? 'Yes' : 'No'}
- Image count: ${signals.imageCount}

DETECTED INTEGRATIONS: ${signals.detectedIntegrations.join(', ') || 'None detected'}

NEGATIVE EVIDENCE (gaps):
${negativeEvidence || 'None'}

POSITIVE EVIDENCE (strengths):
${positiveEvidence || 'None'}
`.trim();
}

const SYSTEM_PROMPT = `You are a senior customer acquisition strategist and conversion consultant working for BotNest, an AI-powered growth platform for service businesses.

Your role is to analyze a structured website audit and produce a SALES DIAGNOSTIC — not an SEO report.

The audit should answer: "Where is this business likely losing customers, and what could BotNest do about it?"

CRITICAL RULES:
1. NEVER fabricate data you were not given. Do not invent traffic numbers, revenue figures, conversion rates, ad spend, bounce rates, or missed call counts.
2. Clearly label each finding as OBSERVED (directly detected from the website) or INFERRED (reasonable business inference).
3. Be specific. Reference actual signals from the data. Do not make generic claims.
4. Be balanced. Always find genuine positives where they exist.
5. Keep findings actionable and in plain business language — no SEO jargon.
6. Map every finding to a specific BotNest solution.
7. The recommended_package should be: 'starter' (solo/small operation, $149/mo), 'growth' (growing local service business, no add-on), or 'scale' (multi-location or high-volume, needs full stack).

BotNest solutions available:
- BotNest AI Lead Capture (24/7 AI chatbot that qualifies and captures leads)
- AI Booking Assistant (books appointments via chat)
- SMS/Email Follow-Up Automation
- Reputation Shield (automates Google review requests + monitoring)
- Multi-Location AI Management
- Website CTA Optimization consultation
- AI Emergency Response (for home services, urgent-inquiry businesses)

Respond with a valid JSON object matching this exact schema — no markdown, no explanation, just the JSON:

{
  "findings": [
    {
      "title": "string (concise, ≤60 chars)",
      "category": "conversion|mobile|performance|lead_capture|follow_up|reputation|messaging",
      "severity": "high|medium|low",
      "evidence": "string — specific observed or inferred fact",
      "business_impact": "string — business consequence in plain language",
      "recommendation": "string — what the business should do",
      "botnest_solution": "string — specific BotNest product/feature",
      "confidence": "high|medium|low",
      "fact_type": "OBSERVED|INFERRED"
    }
  ],
  "strengths": [
    {
      "title": "string",
      "detail": "string"
    }
  ],
  "executiveSummary": "string — 2-3 sentences summarizing the site's biggest growth opportunity in business terms",
  "recommendations": ["string array of 3-5 prioritized next steps"],
  "recommendedPackage": "starter|growth|scale",
  "salesAngle": "string — internal brief for the salesperson: who this business is, what their biggest pain is, the best opening pitch, and why BotNest is the obvious solution. 3-5 sentences max."
}

Generate 3 to 5 findings total. Focus on the highest-impact revenue opportunities. Do not return every possible issue.`;

// ── Dev/test mode: deterministic analysis without OpenAI ─────────────────────
export function analyzeWithoutAI(
  signals: SiteSignals,
  scores: ScoreResult,
  businessInfo: { businessName: string; businessType: string; websiteUrl: string },
  classification?: ClassificationResult,
): AuditAnalysis {
  const findings: Finding[] = scores.categories
    .flatMap(cat => cat.evidence
      .filter(e => e.type === 'negative')
      .slice(0, 1)
      .map(e => ({
        title: e.text.slice(0, 60),
        category: cat.key,
        severity: (cat.score / cat.maxScore < 0.4 ? 'high' : cat.score / cat.maxScore < 0.7 ? 'medium' : 'low') as Finding['severity'],
        evidence: e.text,
        business_impact: 'Potential customer drop-off or missed conversion opportunity.',
        recommendation: 'Review and improve this area to increase lead capture.',
        botnest_solution: 'BotNest AI Lead Capture',
        confidence: 'medium' as Finding['confidence'],
        fact_type: 'OBSERVED' as Finding['fact_type'],
      })),
    )
    .slice(0, 5);

  const strengths: Strength[] = scores.categories
    .flatMap(cat => cat.evidence
      .filter(e => e.type === 'positive')
      .slice(0, 1)
      .map(e => ({ title: e.text.slice(0, 60), detail: e.text })),
    )
    .slice(0, 3);

  const grade = scores.grade;
  const pkg: AuditAnalysis['recommendedPackage'] = scores.total < 50 ? 'scale' : scores.total < 70 ? 'growth' : 'starter';

  return {
    findings,
    strengths,
    executiveSummary: `${businessInfo.businessName} scored ${scores.total}/100 on the BotNest Website Growth Audit. ${grade === 'Significant Opportunity' || grade === 'Needs Improvement' ? 'Several high-impact growth opportunities were identified.' : 'The site performs reasonably well with some areas for improvement.'}`,
    recommendations: findings.slice(0, 3).map(f => f.recommendation),
    recommendedPackage: pkg,
    salesAngle: `[DEV MODE — no AI analysis] ${businessInfo.businessName} at ${businessInfo.websiteUrl}. Quality: ${scores.total}/100. Opportunity: ${scores.opportunityScore} (${scores.opportunityLabel}). Type: ${classification ? categoryLabel(classification.category) : 'unknown'}. Prospect: ${classification?.isBotNestProspect ? 'YES' : 'NO'}.`,
    metadata: { model: 'none (dev mode)', promptTokens: 0, completionTokens: 0, durationMs: 0 },
  };
}

// ── Main analyzer ─────────────────────────────────────────────────────────────
export async function analyzeWithAI(
  signals: SiteSignals,
  scores: ScoreResult,
  businessInfo: { businessName: string; businessType: string; websiteUrl: string },
  openai: OpenAI,
  classification?: ClassificationResult,
): Promise<AuditAnalysis> {
  const signalSummary = buildSignalSummary(signals, scores, businessInfo, classification);
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze this website audit data and generate the structured findings JSON:\n\n${signalSummary}`,
      },
    ],
  });

  const durationMs = Date.now() - start;
  const raw = response.choices[0]?.message?.content?.trim() || '';

  // Strip markdown code fences if model adds them
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed: Omit<AuditAnalysis, 'metadata'>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`AI response was not valid JSON. Raw: ${raw.slice(0, 300)}`);
  }

  // Validate and normalize
  const findings: Finding[] = (parsed.findings || []).slice(0, 5).map(f => ({
    title: String(f.title || '').slice(0, 100),
    category: String(f.category || 'conversion'),
    severity: (['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium') as Finding['severity'],
    evidence: String(f.evidence || ''),
    business_impact: String(f.business_impact || ''),
    recommendation: String(f.recommendation || ''),
    botnest_solution: String(f.botnest_solution || ''),
    confidence: (['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium') as Finding['confidence'],
    fact_type: (['OBSERVED', 'INFERRED'].includes(f.fact_type) ? f.fact_type : 'INFERRED') as Finding['fact_type'],
  }));

  const strengths: Strength[] = (parsed.strengths || []).slice(0, 5).map(s => ({
    title: String(s.title || ''),
    detail: String(s.detail || ''),
  }));

  const validPackages = ['starter', 'growth', 'scale'];
  const recommendedPackage = validPackages.includes(parsed.recommendedPackage)
    ? parsed.recommendedPackage as AuditAnalysis['recommendedPackage']
    : 'growth';

  return {
    findings,
    strengths,
    executiveSummary: String(parsed.executiveSummary || '').slice(0, 800),
    recommendations: (parsed.recommendations || []).slice(0, 6).map(r => String(r)),
    recommendedPackage,
    salesAngle: String(parsed.salesAngle || '').slice(0, 600),
    metadata: {
      model: response.model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      durationMs,
    },
  };
}
