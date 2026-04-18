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
  try {
    const filePath = path.resolve(__dirname, '../../../apps/widget/dist/widget.js');
    console.log('[Widget] Attempting to serve:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('[Widget] File NOT FOUND:', filePath);
      return res.status(404).send('widget.js not found');
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('[Widget] Error serving widget:', err);
    res.status(500).send('Error loading widget');
  }
});

app.use('/widget', express.static(
  path.resolve(__dirname, '../../widget/dist')
));

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
