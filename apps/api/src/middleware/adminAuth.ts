import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const ADMIN_KEY_ENV = 'BOTNEST_ADMIN_API_KEY';
const MIN_ADMIN_KEY_LENGTH = 32;

export type AdminAuthResult = 'ok' | 'not_configured' | 'unauthorized';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time comparison. Hashing first makes the compared buffers equal length. */
export function secureEqual(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

function extractProvidedKey(req: Request): string | null {
  const header = req.headers['x-admin-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === 'string' && value.length > 0) return value;

  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1];
  }
  // Query-string keys are deliberately NOT accepted: they end up in access logs and browser history.
  return null;
}

/**
 * Fail-closed: if the server has no (or a weak) admin key configured, NOBODY is authorized.
 * The key is never logged or echoed.
 */
export function checkAdminKey(req: Request): AdminAuthResult {
  const expected = process.env[ADMIN_KEY_ENV];
  if (!expected || expected.length < MIN_ADMIN_KEY_LENGTH) return 'not_configured';

  const provided = extractProvidedKey(req);
  if (!provided) return 'unauthorized';
  return secureEqual(provided, expected) ? 'ok' : 'unauthorized';
}

let warnedNotConfigured = false;

export function respondAdminAuthFailure(res: Response, result: Exclude<AdminAuthResult, 'ok'>): Response {
  if (result === 'not_configured') {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      console.error(`[admin-auth] ${ADMIN_KEY_ENV} is missing or shorter than ${MIN_ADMIN_KEY_LENGTH} chars; management routes are disabled.`);
    }
    return res.status(503).json({ error: 'admin_api_not_configured' });
  }
  return res.status(401).json({ error: 'unauthorized' });
}

/** Express middleware protecting management (non-widget) routes. */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const result = checkAdminKey(req);
  if (result === 'ok') return next();
  respondAdminAuthFailure(res, result);
}
