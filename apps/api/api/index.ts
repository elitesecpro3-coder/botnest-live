import express, { ErrorRequestHandler } from 'express';

let app: express.Application;

function getApp() {
  if (app) return app;

  // Lazy initialization — defers all imports and supabase/stripe client creation
  // to the first request so startup errors are caught and logged rather than
  // crashing the function process silently.
  const cors = require('cors');
  const { chatLimiter, generalLimiter } = require('../src/middleware/rateLimiter');
  const { createChatRouter } = require('../src/routes/chat');
  const { createConfigRouter } = require('../src/routes/config');
  const { createCreateBotRouter } = require('../src/routes/createBot');
  const { createCheckoutSessionRouter } = require('../src/routes/createCheckoutSession');
  const { createLeadRouter } = require('../src/routes/lead');
  const { createStripeWebhookRouter } = require('../src/routes/stripeWebhook');
  const { createKnowledgeRouter } = require('../src/routes/knowledge');
  const { createOnboardRouter } = require('../src/routes/onboard');
  const OpenAI = require('openai').default;

  app = express();
  app.set('trust proxy', 1);

  const configuredOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);

  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use('/api', createStripeWebhookRouter());
  app.use(express.json());
  app.use('/api', generalLimiter);
  app.use('/api/chat', chatLimiter);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  app.get('/api/health', (_req: express.Request, res: express.Response) => res.json({ status: 'ok' }));

  app.use('/api', createCreateBotRouter());
  app.use('/api', createCheckoutSessionRouter());
  app.use('/api', createLeadRouter());
  app.use('/api', createKnowledgeRouter());
  app.use('/api', createOnboardRouter());
  app.use('/api', createConfigRouter());
  app.use('/api', createChatRouter(openai));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}

module.exports = (req: any, res: any) => {
  try {
    getApp()(req, res);
  } catch (err) {
    console.error('[fatal] App initialization failed:', err);
    res.status(500).json({ error: 'Server initialization failed', detail: String(err) });
  }
};
