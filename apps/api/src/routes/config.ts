import {
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';

import {
  BotConfigRow,
  BotNotFoundError,
  getBotConfig,
} from '../lib/supabaseClient';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toFrontendBotConfig(botId: string, botConfig: BotConfigRow) {
  return {
    botId,
    businessName: botConfig.business_name || botConfig.name || 'BotNest Assistant',
    industry: botConfig.industry || 'General',
    welcomeMessage: botConfig.welcome_message,
    bookingLink: botConfig.booking_link || '',
    leadCaptureEnabled: botConfig.lead_capture_enabled ?? true,
    fallbackContact: botConfig.fallback_contact,
    tone: botConfig.tone || 'Friendly and concise',
    services: toStringArray(botConfig.services),
  };
}

export function createConfigRouter(): Router {
  const router = Router();

  router.get('/config/:botId', async (req: Request<{ botId: string }>, res: Response, next: NextFunction) => {
    try {
      const { botId } = req.params;
      const botConfig = await getBotConfig(botId);
      return res.json(toFrontendBotConfig(botId, botConfig));
    } catch (err) {
      if (err instanceof BotNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
