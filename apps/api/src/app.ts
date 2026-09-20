import express, { Application, ErrorRequestHandler } from 'express';
import OpenAI from 'openai';

import { requireAdminKey } from './middleware/adminAuth';
import { createRateLimiters, RateLimits } from './middleware/rateLimiter';
import { installCors } from './middleware/widgetCors';
import { createChatRouter } from './routes/chat';
import { createConfigRouter } from './routes/config';
import { createCreateBotRouter } from './routes/createBot';
import { createCheckoutSessionRouter } from './routes/createCheckoutSession';
import { createKnowledgeRouter } from './routes/knowledge';
import { createLeadRouter } from './routes/lead';
import { createOnboardRouter } from './routes/onboard';
import { createStripeWebhookRouter } from './routes/stripeWebhook';

// Audit engine moved to reputation-app (Vercel) - see reputation-app/src/app/api/audits/

export type AppOptions = {
  openai: OpenAI;
  /** Test hook: override individual rate limits. */
  rateLimits?: Partial<RateLimits>;
};

/**
 * Route protection model
 *
 * PUBLIC widget endpoints (no admin key; per-bot domain policy + rate limits):
 *   GET  /api/config/:botId      POST /api/chat      POST /api/lead
 * PUBLIC by design: /api/health, /api/session/:id/bot, POST /api/create-checkout-session
 *   (without botId), POST /api/stripe-webhook (Stripe signature).
 * ADMIN (BOTNEST_ADMIN_API_KEY required, stricter rate limits, fail-closed):
 *   /api/knowledge*, /api/onboard, /api/createBot, /api/create-bot,
 *   and POST /api/create-checkout-session when it targets an existing botId.
 */
export function createApp({ openai, rateLimits }: AppOptions): Application {
  const app = express();
  app.set('trust proxy', 1);

  installCors(app);

  // Stripe needs the raw body, so it is mounted before express.json().
  app.use('/api', createStripeWebhookRouter());
  app.use(express.json());

  const limiters = createRateLimiters(rateLimits);
  app.use('/api', limiters.general);
  app.use('/api/chat', limiters.chatPerMinute, limiters.chatPerHour, limiters.chatPerBot);
  app.use('/api/lead', limiters.leadPerIp, limiters.leadPerBot);

  // The failure limiter must sit BEFORE the auth check so it can count rejected attempts.
  app.use(
    ['/api/knowledge', '/api/onboard', '/api/createBot', '/api/create-bot'],
    limiters.adminPerMinute,
    limiters.adminFailures,
    requireAdminKey,
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', createCreateBotRouter());
  app.use('/api', createCheckoutSessionRouter());
  app.use('/api', createLeadRouter());
  app.use('/api', createKnowledgeRouter());
  app.use('/api', createOnboardRouter());
  app.use('/api', createConfigRouter());
  app.use('/api', createChatRouter(openai));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[error-handler]', err);
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Bad request' });
  };
  app.use(errorHandler);

  return app;
}
