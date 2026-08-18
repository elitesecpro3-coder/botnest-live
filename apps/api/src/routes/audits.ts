/**
 * Audit API Routes
 *
 * POST /api/audits          — Create audit job (returns immediately with audit_id)
 * GET  /api/audits/:id      — Poll audit status + results
 * GET  /api/audits/:id/report — Return full report HTML
 * GET  /api/admin/audits    — List all audits (admin)
 * POST /api/admin/audits/:id/reanalyze — Re-run AI analysis (admin)
 * POST /api/admin/audits/:id/status    — Update audit status (admin)
 */

import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

import { validateAuditUrl } from '../audit/fetcher';
import { createAuditRecord, getAuditRecord, listAuditRecords, updateAuditRecord, findRecentAuditByEmail, AuditNotFoundError } from '../audit/auditRepository';
import { runAuditPipeline } from '../audit/auditRunner';

// 2 audit submissions per IP per hour — prevents abuse while allowing retries
const auditSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many audit requests from this address. Please try again in an hour.' });
  },
});

// Separate stricter limit on audit status polling to prevent polling DoS
const auditPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,  // 1/s average
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Slow down polling.' });
  },
});

function requireAdminKey(req: Request, res: Response): boolean {
  const headerKey = req.headers['x-admin-key'];
  const queryKey  = req.query.key;
  const key = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ||
              (Array.isArray(queryKey)  ? queryKey[0]  : String(queryKey || ''));
  const expected = process.env.ADMIN_API_KEY || process.env.INTERNAL_API_SECRET;
  if (!expected || key !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function asTrimmed(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asParamString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export function createAuditRouter(openai: OpenAI): Router {
  const router = Router();

  // ── POST /api/audits ────────────────────────────────────────────────────
  router.post('/audits', auditSubmitLimiter, async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;

      const contactName  = asTrimmed(body.name || body.contact_name);
      const businessName = asTrimmed(body.business_name);
      const email        = asTrimmed(body.email);
      const websiteUrl   = asTrimmed(body.website || body.website_url);
      const phone        = asTrimmed(body.phone) || null;
      const businessType = asTrimmed(body.business_type) || null;

      if (!contactName || !businessName || !email || !websiteUrl) {
        return res.status(400).json({
          error: 'name, business_name, email, and website are required',
        });
      }

      // Field length guards (prevent oversized inputs reaching OpenAI or DB)
      if (contactName.length > 200 || businessName.length > 200 || email.length > 320 || websiteUrl.length > 2048) {
        return res.status(400).json({ error: 'One or more fields exceed maximum allowed length.' });
      }

      // Basic email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      // Validate URL upfront before creating the record
      const validation = validateAuditUrl(websiteUrl);
      if (!validation.valid) {
        return res.status(400).json({ error: `Invalid website URL: ${validation.reason}` });
      }

      // Email dedup: if same email already has a completed/pending/processing audit
      // in the last 24 hours, return the existing audit ID instead of creating a new one.
      const recentAudit = await findRecentAuditByEmail(email, 24);
      if (recentAudit) {
        return res.status(202).json({
          audit_id: recentAudit.id,
          status: recentAudit.status,
          message: 'An audit for this email was recently submitted. Returning existing audit.',
          poll_url: `/api/audits/${recentAudit.id}`,
          deduplicated: true,
        });
      }

      // Create audit record — status: pending
      const audit = await createAuditRecord({
        contact_name: contactName,
        business_name: businessName,
        email,
        phone,
        business_type: businessType,
        website_url: validation.url.href,
      });

      // Respond immediately — client will poll
      res.status(202).json({
        audit_id: audit.id,
        status: 'pending',
        message: 'Your website is being analyzed. This typically takes 30–60 seconds.',
        poll_url: `/api/audits/${audit.id}`,
      });

      // Kick off async pipeline (detached — does not block response)
      setImmediate(() => {
        runAuditPipeline(audit, openai).catch(err => {
          console.error(`[audit:${audit.id}] Unhandled pipeline error:`, err);
        });
      });
    } catch (err) {
      console.error('[audits] POST error:', err);
      res.status(500).json({ error: 'Failed to create audit. Please try again.' });
    }
  });

  // ── GET /api/audits/:id ─────────────────────────────────────────────────
  router.get('/audits/:id', auditPollLimiter, async (req: Request, res: Response) => {
    try {
      const audit = await getAuditRecord(asParamString(req.params.id));

      // Return status + safe public fields (no report_html, no internal sales data)
      const isComplete = audit.status === 'completed';

      res.json({
        audit_id: audit.id,
        status: audit.status,
        business_name: audit.business_name,
        website_url: audit.website_url,
        created_at: audit.created_at,
        completed_at: audit.completed_at || null,
        failure_reason: ['failed', 'manual_review'].includes(audit.status) ? audit.failure_reason : undefined,
        // Public-facing score data (only when complete)
        website_growth_score: isComplete ? audit.website_growth_score : null,
        grade: isComplete ? gradeFromScore(audit.website_growth_score) : null,
        executive_summary: isComplete ? audit.executive_summary : null,
        category_scores: isComplete ? audit.category_scores : null,
        // Top findings — public safe subset (no internal botnest_solution detail)
        findings: isComplete ? (audit.findings || []).slice(0, 5) : null,
        strengths: isComplete ? audit.strengths : null,
        recommendations: isComplete ? audit.recommendations : null,
      });
    } catch (err) {
      if (err instanceof AuditNotFoundError) {
        return res.status(404).json({ error: 'Audit not found' });
      }
      console.error('[audits] GET error:', err);
      res.status(500).json({ error: 'Failed to retrieve audit' });
    }
  });

  // ── GET /api/audits/:id/report ──────────────────────────────────────────
  router.get('/audits/:id/report', async (req: Request, res: Response) => {
    try {
      const audit = await getAuditRecord(asParamString(req.params.id));

      if (audit.status !== 'completed' || !audit.report_html) {
        return res.status(404).json({ error: 'Report not yet available', status: audit.status });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(audit.report_html);
    } catch (err) {
      if (err instanceof AuditNotFoundError) {
        return res.status(404).json({ error: 'Audit not found' });
      }
      res.status(500).json({ error: 'Failed to retrieve report' });
    }
  });

  // ── GET /api/admin/audits ───────────────────────────────────────────────
  router.get('/admin/audits', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const limitRaw  = Array.isArray(req.query.limit)  ? req.query.limit[0]  : req.query.limit;
      const offsetRaw = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
      const statusRaw = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
      const limit  = Math.min(parseInt(String(limitRaw  || '25')), 100);
      const offset = parseInt(String(offsetRaw || '0'));
      const status = statusRaw ? String(statusRaw) : undefined;

      const { audits, total } = await listAuditRecords({ limit, offset, status: status as any });
      res.json({ audits, total, limit, offset });
    } catch (err) {
      console.error('[admin/audits] GET error:', err);
      res.status(500).json({ error: 'Failed to list audits' });
    }
  });

  // ── GET /api/admin/audits/:id ───────────────────────────────────────────
  router.get('/admin/audits/:id', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const audit = await getAuditRecord(asParamString(req.params.id));
      res.json(audit);
    } catch (err) {
      if (err instanceof AuditNotFoundError) return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: 'Failed to retrieve audit' });
    }
  });

  // ── POST /api/admin/audits/:id/reanalyze ───────────────────────────────
  router.post('/admin/audits/:id/reanalyze', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const audit = await getAuditRecord(asParamString(req.params.id));

      if (['processing', 'pending'].includes(audit.status)) {
        return res.status(409).json({ error: 'Audit is already in progress' });
      }

      // Reset status and re-run
      await updateAuditRecord(audit.id, { status: 'pending', failure_reason: null });

      res.json({ audit_id: audit.id, status: 'pending', message: 'Reanalysis started' });

      setImmediate(() => {
        runAuditPipeline({ ...audit, status: 'pending' }, openai).catch(err => {
          console.error(`[audit:${audit.id}] Reanalysis error:`, err);
        });
      });
    } catch (err) {
      if (err instanceof AuditNotFoundError) return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: 'Failed to reanalyze' });
    }
  });

  // ── POST /api/admin/audits/:id/status ──────────────────────────────────
  router.post('/admin/audits/:id/status', async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;
    try {
      const { status } = req.body as { status: string };
      const validStatuses = ['reviewed', 'contacted', 'manual_review', 'pending'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      }

      const updates: Record<string, unknown> = { status };
      if (status === 'reviewed')  updates.reviewed_at  = new Date().toISOString();
      if (status === 'contacted') updates.contacted_at = new Date().toISOString();

      await updateAuditRecord(asParamString(req.params.id), updates);
      res.json({ success: true, status });
    } catch (err) {
      if (err instanceof AuditNotFoundError) return res.status(404).json({ error: 'Not found' });
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  return router;
}

function gradeFromScore(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Needs Improvement';
  return 'Significant Opportunity';
}
