import cors from 'cors';
import express, { ErrorRequestHandler } from 'express';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

import { createChatRouter } from './routes/chat';
import { createConfigRouter } from './routes/config';
import { createCreateBotRouter } from './routes/createBot';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
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
