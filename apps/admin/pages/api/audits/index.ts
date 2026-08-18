/**
 * Server-side proxy: GET /api/audits
 * Lists audits from Railway API.
 * Attaches ADMIN_API_KEY server-side — never exposed to browser.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSession } from '../auth';

const RAILWAY_API = process.env.RAILWAY_API_URL || 'https://botnest-live-production.up.railway.app';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireSession(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: 'Admin API key not configured on server.' });
  }

  const { limit, offset, status } = req.query;
  const params = new URLSearchParams();
  if (limit)  params.set('limit',  String(limit));
  if (offset) params.set('offset', String(offset));
  if (status) params.set('status', String(status));

  try {
    const upstream = await fetch(`${RAILWAY_API}/api/admin/audits?${params}`, {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Upstream error: ${msg}` });
  }
}
