import {
  Request,
  Response,
  Router,
} from 'express';

import {
  createLead,
  getBotConfig,
  LeadInsertError,
} from '../lib/supabaseClient';
import { sendLeadNotification } from '../lib/email';

type LeadBody = {
  botId?: string;
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

      const botId = asTrimmedString(body.botId);
      const name = asTrimmedString(body.name);
      const phone = asTrimmedString(body.phone);
      const email = asTrimmedString(body.email);

      console.log('[lead] botId:', botId);

      if (!botId || !name || !phone) {
        return res.status(400).json({
          error: 'botId, name, and phone are required',
        });
      }

      await createLead({
        bot_id: botId,
        name,
        phone,
        email,
        source: 'widget',
      });

      (async () => {
        try {
          const botConfig = await getBotConfig(botId);
          const notificationEmail = botConfig.notification_email ?? null;
          const businessName = botConfig.business_name ?? null;
          await sendLeadNotification({ botId, name, phone, email, notificationEmail, businessName });
        } catch (err) {
          console.error('🔥 [ALERT] Lead email failed:', err);
        }
      })();

      return res.json({
        success: true,
      });
    } catch (err) {
      const message = err instanceof LeadInsertError
        ? err.message
        : (err instanceof Error ? err.message : 'Failed to save lead');
      console.error(err);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
