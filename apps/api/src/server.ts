import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

import { createApp } from './app';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

if (!process.env.RESEND_API_KEY) {
  console.error('🔥 [ALERT] RESEND_API_KEY is missing — emails will NOT send');
}

if (!process.env.BOTNEST_ADMIN_API_KEY) {
  console.error('[ALERT] BOTNEST_ADMIN_API_KEY is missing — management routes will return 503');
}

const app = createApp({ openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) });

app.get('/widget.js', (_req, res) => {
  // Single authoritative source: apps/widget/dist/widget.js (git-tracked).
  // __dirname at runtime = apps/api/dist/, so ../../../ resolves to repo root.
  const widgetPath = path.resolve(__dirname, '../../../apps/widget/dist/widget.js');

  if (!fs.existsSync(widgetPath)) {
    console.error('[Widget] NOT FOUND at:', widgetPath);
    return res.status(404).send('widget.js not found');
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(widgetPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('API listening on port ' + PORT);
});
