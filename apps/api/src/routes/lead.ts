import {
  Request,
  Response,
  Router,
} from 'express';

import {
  createLead,
  LeadInsertError,
} from '../lib/supabaseClient';

type LeadBody = {
  botId?: string;
  bot_id?: string;
  name?: string;
  phone?: string;
  email?: string;
};

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createLeadRouter(): Router {
  const router = Router();

  router.post('/lead', async (req: Request, res: Response) => {
    try {
      const body = req.body as LeadBody;

      const botId = asTrimmedString(body.botId) || asTrimmedString(body.bot_id);
      const name = asTrimmedString(body.name);
      const phone = asTrimmedString(body.phone);
      const email = asTrimmedString(body.email);

      if (!botId || !name || !phone || !email) {
        return res.status(400).json({
          error: 'botId, name, phone, and email are required',
        });
      }

      const created = await createLead({
        bot_id: botId,
        name,
        phone,
        email,
        source: 'widget',
      });

      return res.status(201).json({
        success: true,
        lead: created,
      });
    } catch (err) {
      const message = err instanceof LeadInsertError
        ? err.message
        : (err instanceof Error ? err.message : 'Failed to save lead');
      console.error('[lead] error:', err);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
