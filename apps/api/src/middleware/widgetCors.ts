import cors from 'cors';
import type { Application, NextFunction, Request, Response } from 'express';

import { BotDomainConfig, checkBotOrigin, getFrontendOriginsFromEnv } from '../lib/originPolicy';

/**
 * CORS model
 *
 * - Public widget endpoints (below) do NOT use the global FRONTEND_ORIGINS list. Preflight cannot
 *   know which bot is being called (botId is in the body), so it reflects the caller's origin; the
 *   real decision is made per bot, server-side, in the route handler via `enforceBotOrigin`, which
 *   only then sets Access-Control-Allow-Origin on the real response. A denied request gets a 403
 *   without any CORS headers, so a foreign page cannot read anything from it.
 * - Every other route keeps the strict global FRONTEND_ORIGINS behavior exactly as before.
 */
const WIDGET_PATH_PREFIXES = ['/api/config', '/api/chat', '/api/lead'];

export function isWidgetPath(path: string): boolean {
  return WIDGET_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

const ORIGIN_SYNTAX = /^https?:\/\/[^/?#@\s]{1,253}$/i;

/** Echo the request's Origin as Access-Control-Allow-Origin if (and only if) it is a syntactically valid origin. */
export function reflectRequestOrigin(req: Request, res: Response): void {
  const origin = req.headers.origin;
  res.vary('Origin');
  if (typeof origin === 'string' && ORIGIN_SYNTAX.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
}

function widgetPreflight(req: Request, res: Response, next: NextFunction): void {
  if (!isWidgetPath(req.path)) return next();
  res.vary('Origin');
  if (req.method !== 'OPTIONS') return next();

  reflectRequestOrigin(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.status(204).end();
}

/**
 * Per-bot origin gate for the widget endpoints. Returns true if the caller may continue.
 * On denial it has already sent the 403 response.
 * `bot` is null for unknown/demo bot ids, which follow the legacy (global) rule.
 */
export function enforceBotOrigin(req: Request, res: Response, bot: BotDomainConfig, botId?: string): boolean {
  const decision = checkBotOrigin(bot, req.headers);
  if (!decision.allowed) {
    console.warn('[origin-policy] denied', {
      botId: typeof botId === 'string' ? botId.slice(0, 64) : undefined,
      mode: decision.mode,
      reason: decision.reason,
      origin: decision.origin,
    });
    res.status(403).json({ error: 'domain_not_allowed' });
    return false;
  }
  reflectRequestOrigin(req, res);
  return true;
}

export function installCors(app: Application): void {
  app.use(widgetPreflight);

  const globalCors = cors({
    origin: (origin, callback) => {
      const configured = getFrontendOriginsFromEnv();
      if (!origin || configured.length === 0 || configured.includes(origin)) {
        return callback(null, true);
      }
      console.error('[cors] Blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const skipWidgetPaths = (req: Request, res: Response, next: NextFunction) =>
    isWidgetPath(req.path) ? next() : globalCors(req, res, next);

  app.use(skipWidgetPaths);
  app.options('*', skipWidgetPaths);
}
