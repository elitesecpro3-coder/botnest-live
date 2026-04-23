import {
  Request,
  Response,
  Router,
} from 'express';

import { createBotConfig } from '../lib/supabaseClient';

type CreateBotBody = {
  business_name?: string;
  booking_link?: string;
  website?: string;
  tone?: string;
  selected_plan?: string;
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
      const {
        business_name,
        website,
        booking_link,
        tone,
        selected_plan,
      } = req.body as CreateBotBody;

      const parsedBusinessName = asTrimmedString(business_name);
      const parsedWebsite = asTrimmedString(website);
      const parsedBookingLink = asTrimmedString(booking_link);
      const parsedTone = asTrimmedString(tone);
      const parsedSelectedPlan = asTrimmedString(selected_plan);

      console.log("parsed fields:", {
        business_name: parsedBusinessName,
        website: parsedWebsite,
        booking_link: parsedBookingLink,
        tone: parsedTone,
      });

      if (!parsedBusinessName || !parsedWebsite || !parsedSelectedPlan) {
        return res.status(400).json({
          error: 'Validation failed',
          missingFields: {
            business_name: !parsedBusinessName,
            website: !parsedWebsite,
            selected_plan: !parsedSelectedPlan,
          },
          received: req.body,
        });
      }

      const created = await createBotConfig({
        user_id: TEMP_USER_ID,
        business_name: parsedBusinessName,
        website: parsedWebsite,
        booking_link: parsedBookingLink,
        tone: parsedTone,
        usage_count: 0,
        usage_limit: 500,
        welcome_message: null,
        system_prompt: null,
        fallback_contact: null,
        lead_capture_enabled: true,
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
