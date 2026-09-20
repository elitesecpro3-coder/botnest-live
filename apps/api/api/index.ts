import type { Application } from 'express';

let app: Application | undefined;

function getApp(): Application {
  if (app) return app;

  // Lazy initialization - defers all imports and supabase/stripe client creation
  // to the first request so startup errors are caught and logged rather than
  // crashing the function process silently.
  const OpenAI = require('openai').default;
  const { createApp } = require('../src/app');

  app = createApp({ openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) }) as Application;

  // Snippets generated before the embed URL fix pointed at api.bot-nest.com/widget.js (a 404).
  // The widget is hosted with the marketing site, so send those requests there.
  const widgetUrl = process.env.WIDGET_JS_URL || 'https://bot-nest.com/widget.js';
  app.get('/widget.js', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, widgetUrl);
  });

  return app;
}

module.exports = (req: any, res: any) => {
  try {
    getApp()(req, res);
  } catch (err) {
    console.error('[fatal] App initialization failed:', err);
    res.status(500).json({ error: 'Server initialization failed' });
  }
};
