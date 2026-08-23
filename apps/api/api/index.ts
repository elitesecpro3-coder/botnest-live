import cors from 'cors';
import express, { ErrorRequestHandler } from 'express';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

import { chatLimiter, generalLimiter } from '../src/middleware/rateLimiter';
import { createChatRouter } from '../src/routes/chat';
import { createConfigRouter } from '../src/routes/config';
import { createCreateBotRouter } from '../src/routes/createBot';
import { createCheckoutSessionRouter } from '../src/routes/createCheckoutSession';
import { createLeadRouter } from '../src/routes/lead';
import { createStripeWebhookRouter } from '../src/routes/stripeWebhook';
import { createKnowledgeRouter } from '../src/routes/knowledge';
import { createOnboardRouter } from '../src/routes/onboard';

const app = express();
app.set('trust proxy', 1);

const configuredOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
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

// Widget JS served from static file at bot-nest.com/widget.js — keep this
// as a fallback for any embed codes that still point here.
app.get('/widget.js', (_req, res) => {
  const widgetPath = path.resolve(process.cwd(), 'apps/widget/dist/widget.js');
  if (!fs.existsSync(widgetPath)) {
    return res.status(404).send('widget.js not found');
  }
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(widgetPath);
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

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

module.exports = app;
