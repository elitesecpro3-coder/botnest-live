/**
 * Server-side proxy: GET/POST /api/audits/[id]
 * Handles: get one audit, update status, reanalyze, get report HTML.
 * Attaches ADMIN_API_KEY server-side — never exposed to browser.
 *
 * Audit API now lives on reputation-app (Vercel), not Railway.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../auth';

const AUDIT_API = process.env.AUDIT_API_URL || 'https://app.bot-nest.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireSession(req, res)) return;

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: 'Admin API key not configured on server.' });
  }

  const { id, action } = req.query;
  const auditId = Array.isArray(id) ? id[0] : id;

  if (!auditId) {
    return res.status(400).json({ error: 'Missing audit ID' });
  }

  // GET /api/audits/[id] → full admin record
  if (req.method === 'GET' && !action) {
    try {
      const upstream = await fetch(`${AUDIT_API}/api/audits/${auditId}?action=full`, {
        headers: { 'x-admin-key': adminKey },
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: `Upstream error: ${msg}` });
    }
  }

  // GET /api/audits/[id]?action=report → return HTML report
  if (req.method === 'GET' && action === 'report') {
    try {
      const upstream = await fetch(`${AUDIT_API}/api/audits/${auditId}?action=report`, {
        headers: { 'x-admin-key': adminKey },
      });
      if (!upstream.ok) {
        const data = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json(data);
      }
      const html = await upstream.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: `Upstream error: ${msg}` });
    }
  }

  // POST /api/audits/[id]?action=status → update status
  if (req.method === 'POST' && action === 'status') {
    try {
      const upstream = await fetch(`${AUDIT_API}/api/audits/${auditId}?action=status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: `Upstream error: ${msg}` });
    }
  }

  // POST /api/audits/[id]?action=reanalyze → reset to pending
  if (req.method === 'POST' && action === 'reanalyze') {
    try {
      const upstream = await fetch(`${AUDIT_API}/api/audits/${auditId}?action=reanalyze`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: `Upstream error: ${msg}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
