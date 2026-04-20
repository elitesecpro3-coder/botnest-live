import {
  Request,
  Response,
  Router,
} from 'express';

import {
  createBotConfig,
  DuplicateBotIdError,
} from '../lib/supabaseClient';

type CreateBotBody = {
  id?: string;
  user_id?: string;
  businessName?: string;
  business_name?: string;
  bookingLink?: string;
  booking_link?: string;
  website?: string;
  tone?: string;
};

const PLACEHOLDER_USER_ID = process.env.PLACEHOLDER_USER_ID || '00000000-0000-0000-0000-000000000000';

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildEmbedCode(req: Request, botId: string): string {
  const widgetScriptUrl = process.env.WIDGET_SCRIPT_URL || 'https://widget.botnest.ai/widget.js';
  const defaultApiUrl = `${req.protocol}://${req.get('host')}`;
  const apiUrl = process.env.PUBLIC_API_BASE_URL || defaultApiUrl;

  return `<script src="${widgetScriptUrl}" data-bot-id="${botId}" data-api-url="${apiUrl}"></script>`;
}

export function createCreateBotRouter(): Router {
  const router = Router();

  const handler = async (req: Request, res: Response) => {
    try {
      const body = req.body as CreateBotBody;

      const id = asTrimmedString(body.id);
      const userId = asTrimmedString(body.user_id) || PLACEHOLDER_USER_ID;
      const businessName = asTrimmedString(body.businessName) || asTrimmedString(body.business_name);
      const website = asTrimmedString(body.website);
      const bookingLink = asTrimmedString(body.bookingLink) || asTrimmedString(body.booking_link);
      const tone = asTrimmedString(body.tone);

      if (!businessName || !website || !bookingLink || !tone) {
        return res.status(400).json({
          error: 'business_name, website, booking_link, and tone are required',
        });
      }

      const created = await createBotConfig({
        id,
        user_id: userId,
        business_name: businessName,
        website,
        tone,
        booking_link: bookingLink,
      });

      return res.status(201).json({
        success: true,
        bot: created,
        embedCode: buildEmbedCode(req, created.id),
      });
    } catch (err) {
      if (err instanceof DuplicateBotIdError) {
        return res.status(409).json({ error: err.message });
      }
      console.error('[createBot] error:', err);
      const message = err instanceof Error ? err.message : 'Failed to create bot';
      return res.status(500).json({ error: message });
    }
  };

  router.post('/createBot', handler);
  router.post('/create-bot', handler);

  return router;
}
