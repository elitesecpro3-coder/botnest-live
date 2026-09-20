import { Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { reflectRequestOrigin } from './widgetCors';

/**
 * IMPORTANT (Vercel serverless): these limiters use express-rate-limit's default in-memory store,
 * which is PER FUNCTION INSTANCE. Concurrent instances each keep their own counters and a cold start
 * resets them, so the effective global limit is (limit x live instances) and is best-effort, not a
 * hard guarantee. They still stop a single client hammering one warm instance, and they are layered
 * with limits that ARE durable/global: the per-bot `usage_limit` cap (stored in Postgres), input size
 * caps, and (recommended) a Vercel Firewall rate-limit rule + an OpenAI project spend cap.
 */
export type RateLimits = {
  generalPerMinute: number;
  chatPerMinute: number;
  chatPerHour: number;
  chatPerBotPerMinute: number;
  leadPerTenMinutes: number;
  leadPerBotPerHour: number;
  adminPerMinute: number;
  adminFailuresPer15Minutes: number;
};

export const DEFAULT_RATE_LIMITS: RateLimits = {
  generalPerMinute: 60, // unchanged from the original limiter; covers config, chat and lead combined per IP
  chatPerMinute: 30, // unchanged from the original limiter
  chatPerHour: 200,
  chatPerBotPerMinute: 240,
  leadPerTenMinutes: 5,
  leadPerBotPerHour: 60,
  adminPerMinute: 60,
  adminFailuresPer15Minutes: 10,
};

const MINUTE = 60 * 1000;

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip || 'unknown');
}

function bodyBotId(req: Request): string {
  const botId = (req.body as { botId?: unknown } | undefined)?.botId;
  return typeof botId === 'string' && botId.length > 0 ? botId.slice(0, 64) : 'none';
}

function limited(kind: string) {
  return (req: Request, res: Response): Response => {
    console.warn(`[rate-limit] ${kind} exceeded`, { ip: req.ip, path: req.path });
    // A 429 carries no bot data, so it is safe to let the requesting page read it (the widget then
    // shows its normal "try again" message instead of a generic network failure).
    reflectRequestOrigin(req, res);
    return res.status(429).json({ error: 'Too many requests, please try again later.' });
  };
}

function build(kind: string, windowMs: number, limit: number, keyGenerator: (req: Request) => string, extra: object = {}): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: limited(kind),
    ...extra,
  });
}

export function createRateLimiters(overrides: Partial<RateLimits> = {}) {
  const l: RateLimits = { ...DEFAULT_RATE_LIMITS, ...overrides };

  return {
    /** Every /api request, per IP. */
    general: build('general', MINUTE, l.generalPerMinute, clientIp),

    /** /api/chat: per IP per minute, per IP per hour, and per bot across all visitors. */
    chatPerMinute: build('chat/minute', MINUTE, l.chatPerMinute, clientIp),
    chatPerHour: build('chat/hour', 60 * MINUTE, l.chatPerHour, (req) => `${clientIp(req)}`),
    chatPerBot: build('chat/bot', MINUTE, l.chatPerBotPerMinute, (req) => `bot:${bodyBotId(req)}`),

    /** /api/lead: a real visitor submits about once; keep this tight. */
    leadPerIp: build('lead/ip', 10 * MINUTE, l.leadPerTenMinutes, clientIp),
    leadPerBot: build('lead/bot', 60 * MINUTE, l.leadPerBotPerHour, (req) => `bot:${bodyBotId(req)}`),

    /** Management routes: request ceiling plus a much stricter cap on FAILED authentication attempts. */
    adminPerMinute: build('admin', MINUTE, l.adminPerMinute, clientIp),
    adminFailures: build('admin-auth-failures', 15 * MINUTE, l.adminFailuresPer15Minutes, clientIp, {
      skipSuccessfulRequests: true,
    }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
