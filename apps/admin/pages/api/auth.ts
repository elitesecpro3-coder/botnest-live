/**
 * Admin session auth endpoint.
 * POST /api/auth — validate password, set httpOnly session cookie
 * DELETE /api/auth — clear session cookie
 *
 * Secret lives only in ADMIN_PASSWORD (server env, never NEXT_PUBLIC_).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

// Session token stored in httpOnly cookie — opaque random value.
// We store it in memory for V1 (single-instance). For multi-instance
// Railway deployments, replace with a short-lived JWT signed by ADMIN_PASSWORD.
const activeSessions = new Set<string>();

const COOKIE_NAME = 'botnest_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still do a comparison to avoid timing leaks on length
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin authentication is not configured.' });
  }

  if (req.method === 'POST') {
    const { password } = req.body as { password?: string };
    if (!password || !timingSafeEqual(password, adminPassword)) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);

    // Auto-expire
    setTimeout(() => activeSessions.delete(token), SESSION_TTL_MS);

    res.setHeader('Set-Cookie', [
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    ]);

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const token = getCookieValue(req.headers.cookie || '', COOKIE_NAME);
    if (token) activeSessions.delete(token);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export function requireSession(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookieValue(req.headers.cookie || '', COOKIE_NAME);
  if (!token || !activeSessions.has(token)) {
    res.status(401).json({ error: 'Unauthorized. Please log in at /audits.' });
    return false;
  }
  return true;
}

export function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
