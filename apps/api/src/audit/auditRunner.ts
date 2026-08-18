/**
 * Audit Orchestrator
 * Coordinates the full pipeline:
 * fetch → extract → score → AI analysis → report → save
 *
 * Designed for async execution — called after the HTTP response returns the audit ID.
 */

import OpenAI from 'openai';
import { validateAuditUrl, fetchWebsite } from './fetcher';
import { extractSignals } from './extractor';
import { classifySite } from './classifier';
import { scoreWebsite } from './scorer';
import { analyzeWithAI, analyzeWithoutAI } from './analyzer';
import { generateReportHtml } from './reportGenerator';
import { updateAuditRecord, claimAuditForProcessing, findStaleAudits, resetStaleAudit, AuditRecord } from './auditRepository';
import { sendAuditNotification } from '../lib/email';

export async function runAuditPipeline(audit: AuditRecord, openai: OpenAI): Promise<void> {
  const auditId = audit.id;
  console.log(`[audit:${auditId}] Pipeline starting for ${audit.website_url}`);

  // Atomic claim — prevents concurrent processing if process was restarted
  // and a second request tries to re-run the same audit.
  const claimed = await claimAuditForProcessing(auditId);
  if (!claimed) {
    console.warn(`[audit:${auditId}] Could not claim audit — already processing or completed. Skipping.`);
    return;
  }

  try {
    // ── 1. Validate URL ───────────────────────────────────────────────────
    const validation = validateAuditUrl(audit.website_url);
    if (!validation.valid) {
      await updateAuditRecord(auditId, {
        status: 'failed',
        failure_reason: `Invalid URL: ${validation.reason}`,
      });
      console.warn(`[audit:${auditId}] URL validation failed: ${validation.reason}`);
      return;
    }

    // ── 2. Fetch website ──────────────────────────────────────────────────
    const fetchResult = await fetchWebsite(validation.url);
    if (!fetchResult.ok) {
      await updateAuditRecord(auditId, {
        status: 'manual_review',
        failure_reason: fetchResult.reason,
      });
      console.warn(`[audit:${auditId}] Fetch failed: ${fetchResult.reason}`);
      // Still notify admin — we have the lead, just couldn't fetch the site
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

    console.log(`[audit:${auditId}] Fetched ${fetchResult.url} (${fetchResult.html.length} chars, ${fetchResult.responseTimeMs}ms)`);

    // ── 3. Extract signals ────────────────────────────────────────────────
    const pageWeightKb = Math.round(fetchResult.html.length / 1024);
    const signals = extractSignals(fetchResult.html, {
      url: audit.website_url,
      finalUrl: fetchResult.url,
      statusCode: fetchResult.statusCode,
      responseTimeMs: fetchResult.responseTimeMs,
      redirectCount: fetchResult.redirectCount,
      pageWeightKb,
    });

    console.log(`[audit:${auditId}] Signals extracted. Phone: ${signals.phoneNumbers.length}, Forms: ${signals.formCount}, Chat: ${signals.hasLiveChat || signals.hasAiChat}`);

    // ── 4. Classify + Score ───────────────────────────────────────────────
    const classification = classifySite(signals);
    console.log(`[audit:${auditId}] Classified as: ${classification.category} (${classification.confidence}) | BotNest prospect: ${classification.isBotNestProspect}`);
    const scores = scoreWebsite(signals, classification);
    console.log(`[audit:${auditId}] Quality: ${scores.total}/100 (${scores.grade}) | Opportunity: ${scores.opportunityScore} ${scores.opportunityLabel}`);

    // ── 5. AI analysis (or deterministic dev mode) ────────────────────────
    const aiDisabled = process.env.AUDIT_AI_DISABLED === 'true';
    const businessInfoForAnalysis = {
      businessName: audit.business_name,
      businessType: audit.business_type || '',
      websiteUrl: fetchResult.url,
    };

    const analysis = aiDisabled
      ? analyzeWithoutAI(signals, scores, businessInfoForAnalysis, classification)
      : await analyzeWithAI(signals, scores, businessInfoForAnalysis, openai, classification);

    console.log(`[audit:${auditId}] Analysis complete (${aiDisabled ? 'dev mode' : 'AI'}). ${analysis.findings.length} findings. Tokens: ${analysis.metadata.promptTokens}+${analysis.metadata.completionTokens}`);

    // ── 6. Generate report HTML ───────────────────────────────────────────
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

    // ── 7. Category score breakdown ───────────────────────────────────────
    const categoryScores = Object.fromEntries(
      scores.categories.map(c => [c.key, { score: c.score, max: c.maxScore }]),
    );

    // ── 8. Save completed audit ───────────────────────────────────────────
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

    // ── 9. Notify admin ───────────────────────────────────────────────────
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

/**
 * Stale job recovery — scans for audits stuck in pending/processing.
 * Called at startup and periodically.
 * Resets stuck jobs back to pending so they can be retried.
 * If a job has been reset more than MAX_RETRIES times, marks it failed.
 */
const MAX_AUTO_RETRIES = 2;
const STALE_THRESHOLD_MINUTES = 10;

export async function recoverStaleAudits(openai: OpenAI): Promise<void> {
  try {
    const stale = await findStaleAudits(STALE_THRESHOLD_MINUTES);
    if (stale.length === 0) return;

    console.log(`[audit:recovery] Found ${stale.length} stale audit(s)`);

    for (const audit of stale) {
      const failureNote = audit.failure_reason || '';
      const resetCount = (failureNote.match(/Auto-reset/g) || []).length;

      if (resetCount >= MAX_AUTO_RETRIES) {
        console.warn(`[audit:${audit.id}] Exceeded max retries — marking manual_review`);
        await updateAuditRecord(audit.id, {
          status: 'manual_review',
          failure_reason: `Exceeded ${MAX_AUTO_RETRIES} automatic retry attempts. Manual review required.`,
        });
        continue;
      }

      console.log(`[audit:${audit.id}] Resetting stale ${audit.status} → pending (retry ${resetCount + 1}/${MAX_AUTO_RETRIES})`);
      await resetStaleAudit(audit.id, audit.status);

      // Re-fetch and re-run with a short delay to avoid hammering resources
      setTimeout(() => {
        runAuditPipeline(audit, openai).catch(err => {
          console.error(`[audit:${audit.id}] Recovery pipeline error:`, err);
        });
      }, 2000 * (resetCount + 1));
    }
  } catch (err) {
    console.error('[audit:recovery] Recovery scan error:', err);
  }
}

/**
 * Start the periodic stale-job recovery scheduler.
 * Call once at server startup.
 */
export function startAuditRecoveryScheduler(openai: OpenAI): void {
  const INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

  // Run once at startup (after a 30s delay to let the server warm up)
  setTimeout(() => recoverStaleAudits(openai), 30_000);

  // Then run periodically
  setInterval(() => recoverStaleAudits(openai), INTERVAL_MS);

  console.log('[audit:recovery] Stale job recovery scheduler started (interval: 5m)');
}
