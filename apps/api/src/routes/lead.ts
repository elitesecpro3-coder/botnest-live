import {
  Request,
  Response,
  Router,
} from 'express';

import {
  BotNotFoundError,
  createLead,
  getBotConfig,
} from '../lib/supabaseClient';
import { sendLeadNotification } from '../lib/email';
import { enforceBotOrigin } from '../middleware/widgetCors';

type LeadBody = {
  botId?: string;
  name?: string;
  phone?: string;
  email?: string;
};

const MAX_NAME = 200;
const MAX_PHONE = 50;
const MAX_EMAIL = 254;

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createLeadRouter(): Router {
  const router = Router();

  router.post('/lead', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as LeadBody;

      const botId = asTrimmedString(body.botId);
      const name = asTrimmedString(body.name);
      const phone = asTrimmedString(body.phone);
      const email = asTrimmedString(body.email);

      if (!botId || !name || !phone) {
        return res.status(400).json({
          error: 'botId, name, and phone are required',
        });
      }

      if (name.length > MAX_NAME || phone.length > MAX_PHONE || (email && email.length > MAX_EMAIL)) {
        return res.status(400).json({ error: 'One or more fields are too long' });
      }

      // The bot must exist before anything is written (previously a bad id surfaced as a raw FK error).
      let botConfig: Awaited<ReturnType<typeof getBotConfig>>;
      try {
        botConfig = await getBotConfig(botId);
      } catch (err) {
        if (err instanceof BotNotFoundError) {
          if (!enforceBotOrigin(req, res, null, botId)) return;
          return res.status(404).json({ error: 'Unknown bot' });
        }
        throw err;
      }

      if (!enforceBotOrigin(req, res, botConfig, botId)) return;

      if (botConfig.is_active === false) {
        return res.status(403).json({ error: 'inactive' });
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
      console.error('[lead] Failed to save lead:', err);
      return res.status(500).json({ error: 'Failed to save lead' });
    }
  });

  return router;
}
