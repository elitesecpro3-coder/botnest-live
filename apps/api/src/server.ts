import cors from 'cors';
import express, { ErrorRequestHandler } from 'express';
import OpenAI from 'openai';

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
