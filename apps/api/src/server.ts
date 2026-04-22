import cors from 'cors';
import express, { ErrorRequestHandler } from 'express';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

import { createChatRouter } from './routes/chat';
import { createConfigRouter } from './routes/config';
import { createCreateBotRouter } from './routes/createBot';
import { createCheckoutSessionRouter } from './routes/createCheckoutSession';
import { createLeadRouter } from './routes/lead';
import { createStripeWebhookRouter } from './routes/stripeWebhook';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const configuredOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  // If no frontend origins are configured, default to permissive behavior.
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.error('[cors] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use('/api', createStripeWebhookRouter());
app.use(express.json());

app.get('/widget.js', (_req, res) => {
  // Primary: co-located copy (built into api/dist by build script)
  const colocated = path.resolve(__dirname, 'widget.js');
  // Fallback: workspace path (works in local dev)
  const workspace = path.resolve(__dirname, '../../../apps/widget/dist/widget.js');
  const filePath = fs.existsSync(colocated) ? colocated : workspace;

  if (!fs.existsSync(filePath)) {
    console.error('[Widget] NOT FOUND. Checked:', colocated, workspace);
    return res.status(404).send('widget.js not found');
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(filePath);
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createCreateBotRouter());
app.use('/api', createCheckoutSessionRouter());
app.use('/api', createLeadRouter());
app.use('/api', createConfigRouter());
app.use('/api', createChatRouter(openai));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('API listening on port ' + PORT);
});
