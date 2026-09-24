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
      console.log(`[lead] saved successfully — bot ${botId} (via /api/lead)`);

      // Awaited (not fire-and-forget): a serverless function may freeze immediately after the
      // HTTP response is sent, silently dropping any work still in flight. Resend calls are
      // fast, so awaiting here trades a small, bounded latency for guaranteed delivery attempts.
      const notification = await sendLeadNotification({
        botId,
        name,
        phone,
        email,
        notificationEmail: botConfig.notification_email ?? null,
        businessName: botConfig.business_name ?? null,
      });
      if (notification.notified) {
        console.log(`[lead] notification accepted by Resend — bot ${botId}${notification.usedFallback ? ' (via fallback address)' : ''}`);
      } else {
        console.error(`[lead] notification FAILED — bot ${botId}:`, JSON.stringify(notification.error));
      }

      return res.json({
        success: true,
        notified: notification.notified,
      });
    } catch (err) {
      console.error('[lead] Failed to save lead:', err);
      return res.status(500).json({ error: 'Failed to save lead' });
    }
  });

  return router;
}
