/**
 * Audit Pipeline — Vercel-compatible (no setImmediate, no persistent scheduler)
 *
 * Called synchronously from the process-pending cron route.
 * Each invocation processes ONE audit record fully before returning.
 * The cron route handles batching by calling this in a loop with per-job error isolation.
 */

import OpenAI from 'openai';

import { analyzeWithAI, analyzeWithoutAI } from './analyzer';
import { sendAuditNotification } from './auditEmail';
import {
  AuditRecord,
  claimAuditForProcessing,
  updateAuditRecord,
} from './auditRepository';
import { classifySite } from './classifier';
import { extractSignals } from './extractor';
import { fetchWebsite,validateAuditUrl } from './fetcher';
import { generateReportHtml } from './reportGenerator';
import { scoreWebsite } from './scorer';

export async function runAuditPipeline(audit: AuditRecord, openai: OpenAI): Promise<void> {
  const auditId = audit.id;
  console.log(`[audit:${auditId}] Pipeline starting for ${audit.website_url}`);

  // Atomic claim — prevents two cron invocations from processing the same audit.
  // If the record was already claimed (e.g. a concurrent cron tick), we skip it.
  const claimed = await claimAuditForProcessing(auditId);
  if (!claimed) {
    console.warn(`[audit:${auditId}] Already claimed — skipping`);
    return;
  }

  try {
    // 1. Validate URL
    const validation = validateAuditUrl(audit.website_url);
    if (!validation.valid) {
      await updateAuditRecord(auditId, {
        status: 'failed',
        failure_reason: `Invalid URL: ${validation.reason}`,
      });
      console.warn(`[audit:${auditId}] URL invalid: ${validation.reason}`);
      return;
    }

    // 2. Fetch
    const fetchResult = await fetchWebsite(validation.url);
    if (!fetchResult.ok) {
      await updateAuditRecord(auditId, {
        status: 'manual_review',
        failure_reason: fetchResult.reason,
      });
      console.warn(`[audit:${auditId}] Fetch failed: ${fetchResult.reason}`);
      await sendAuditNotification({
        auditId,
        businessName: audit.business_name,
        contactName: audit.contact_name,
        email: audit.email,
        phone: audit.phone || undefined,
        websiteUrl: audit.website_url,
        websiteGrowthScore: null,
        opportunityScore: null,
        opportunityLabel: null,
        topFindings: [],
        salesAngle: null,
        recommendedPackage: null,
        status: 'manual_review',
        failureReason: fetchResult.reason,
      });
      return;
    }

    console.log(`[audit:${auditId}] Fetched (${fetchResult.html.length} chars, ${fetchResult.responseTimeMs}ms)`);

    // 3. Extract signals
    const pageWeightKb = Math.round(fetchResult.html.length / 1024);
    const signals = extractSignals(fetchResult.html, {
      url: audit.website_url,
      finalUrl: fetchResult.url,
      statusCode: fetchResult.statusCode,
      responseTimeMs: fetchResult.responseTimeMs,
      redirectCount: fetchResult.redirectCount,
      pageWeightKb,
    });

    // 4. Classify + Score
    const classification = classifySite(signals);
    console.log(`[audit:${auditId}] ${classification.category} (${classification.confidence}) | prospect: ${classification.isBotNestProspect}`);
    const scores = scoreWebsite(signals, classification);
    console.log(`[audit:${auditId}] Quality: ${scores.total}/100 | Opportunity: ${scores.opportunityScore} ${scores.opportunityLabel}`);

    // 5. AI analysis or dev-mode fallback
    const aiDisabled = process.env.AUDIT_AI_DISABLED === 'true';
    const businessInfo = {
      businessName: audit.business_name,
      businessType: audit.business_type || '',
      websiteUrl: fetchResult.url,
    };

    const analysis = aiDisabled
      ? analyzeWithoutAI(signals, scores, businessInfo, classification)
      : await analyzeWithAI(signals, scores, businessInfo, openai, classification);

    console.log(`[audit:${auditId}] Analysis complete (${aiDisabled ? 'dev' : 'AI'}). ${analysis.findings.length} findings.`);

    // 6. Generate HTML report
    const reportHtml = generateReportHtml({
      auditId,
      businessName: audit.business_name,
      websiteUrl: fetchResult.url,
      contactName: audit.contact_name,
      businessType: audit.business_type || '',
      createdAt: audit.created_at,
      signals,
      scores,
      analysis,
    });

    // 7. Category score breakdown
    const categoryScores = Object.fromEntries(
      scores.categories.map(c => [c.key, { score: c.score, max: c.maxScore }]),
    );

    // 8. Save completed record
    await updateAuditRecord(auditId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      website_growth_score: scores.total,
      opportunity_score: scores.opportunityScore,
      category_scores: categoryScores,
      extracted_data: signals as unknown as Record<string, unknown>,
      findings: analysis.findings as unknown as Record<string, unknown>[],
      strengths: analysis.strengths as unknown as Record<string, unknown>[],
      executive_summary: analysis.executiveSummary,
      recommendations: analysis.recommendations,
      recommended_package: analysis.recommendedPackage,
      sales_angle: analysis.salesAngle,
      opportunity_label: scores.opportunityLabel,
      raw_analysis_metadata: analysis.metadata as unknown as Record<string, unknown>,
      report_html: reportHtml,
    });

    console.log(`[audit:${auditId}] Saved. Score: ${scores.total}/100`);

    // 9. Notify admin (never prospect)
    await sendAuditNotification({
      auditId,
      businessName: audit.business_name,
      contactName: audit.contact_name,
      email: audit.email,
      phone: audit.phone || undefined,
      websiteUrl: fetchResult.url,
      websiteGrowthScore: scores.total,
      opportunityScore: scores.opportunityScore,
      opportunityLabel: scores.opportunityLabel,
      topFindings: analysis.findings.slice(0, 3).map(f => ({
        title: f.title,
        severity: f.severity,
        botnest_solution: f.botnest_solution,
      })),
      salesAngle: analysis.salesAngle,
      recommendedPackage: analysis.recommendedPackage,
      status: 'completed',
    });

    console.log(`[audit:${auditId}] Pipeline complete.`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[audit:${auditId}] Pipeline error:`, err);
    await updateAuditRecord(auditId, {
      status: 'failed',
      failure_reason: `Internal error: ${detail.slice(0, 500)}`,
    });
  }
}
