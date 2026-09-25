import {
  Request,
  Response,
  Router,
} from 'express';

import {
  BotNotFoundError,
  createOrUpdateLead,
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

      const { row: leadRow, isDuplicate } = await createOrUpdateLead({
        bot_id: botId,
        name,
        phone,
        email,
        source: 'widget',
      });

      if (isDuplicate) {
        // Same visitor (matched by phone/email), same bot, within the dedupe window — merged into
        // the existing lead row rather than inserted again, and NOT re-notified (see
        // createOrUpdateLead's doc comment for why: this business was already notified for this
        // contact recently, and a second email for the same inquiry is noise, not a new lead).
        console.log(`[lead] duplicate — bot ${botId}, merged into existing lead ${leadRow.id} (via /api/lead)`);
        return res.json({ success: true, notified: false, duplicate: true });
      }

      console.log(`[lead] saved successfully — bot ${botId}, lead ${leadRow.id} (via /api/lead)`);

      // Awaited (not fire-and-forget): a serverless function may freeze immediately after the
      // HTTP response is sent, silently dropping any work still in flight. The configured provider
      // (Brevo or Resend — see EMAIL_PROVIDER) is fast, so awaiting here trades a small, bounded
      // latency for guaranteed delivery attempts.
      const notification = await sendLeadNotification({
        botId,
        name,
        phone,
        email,
        notificationEmail: botConfig.notification_email ?? null,
        businessName: botConfig.business_name ?? null,
      });
      if (notification.notified) {
        console.log(`[lead] notification accepted — bot ${botId}${notification.usedFallback ? ' (via fallback address)' : ''}`);
      } else {
        console.error(`[lead] notification FAILED — bot ${botId}:`, JSON.stringify(notification.error));
      }

      return res.json({
        success: true,
        notified: notification.notified,
        duplicate: false,
      });
    } catch (err) {
      console.error('[lead] Failed to save lead:', err);
      return res.status(500).json({ error: 'Failed to save lead' });
    }
  });

  return router;
}
