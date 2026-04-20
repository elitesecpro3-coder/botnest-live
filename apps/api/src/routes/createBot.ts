import {
  Request,
  Response,
  Router,
} from 'express';

import { createBotConfig } from '../lib/supabaseClient';

type CreateBotBody = {
  businessName?: string;
  bookingLink?: string;
  website?: string;
  tone?: string;
};

const TEMP_USER_ID = 'c5ea980f-669b-4ff7-968e-627115f47ed1';

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createCreateBotRouter(): Router {
  const router = Router();

  const handler = async (req: Request, res: Response) => {
    console.log("createBot payload:", req.body);

    try {
      const body = req.body as CreateBotBody;

      const businessName = asTrimmedString(body.businessName);
      const website = asTrimmedString(body.website);
      const bookingLink = asTrimmedString(body.bookingLink);
      const tone = asTrimmedString(body.tone);

      if (!businessName || !website || !bookingLink || !tone) {
        return res.status(400).json({
          error: 'Validation failed',
          missingFields: {
            business_name: !businessName,
            website: !website,
            booking_link: !bookingLink,
            tone: !tone,
          },
          received: req.body,
        });
      }

      const created = await createBotConfig({
        user_id: TEMP_USER_ID,
        business_name: businessName,
        website,
        tone,
        booking_link: bookingLink,
        usage_count: 0,
        usage_limit: 500,
      });

      return res.status(201).json({
        botId: created.id,
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to create bot';
      return res.status(500).json({ error: message });
    }
  };

  router.post('/createBot', handler);
  router.post('/create-bot', handler);

  return router;
}
