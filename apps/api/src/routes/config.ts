import {
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

import {
  BotConfigRow,
  BotNotFoundError,
  getBotConfig,
  getBotByStripeSubscriptionId,
} from '../lib/supabaseClient';
import { enforceBotOrigin } from '../middleware/widgetCors';

const DEMO_FALLBACK_CONFIG = {
  botId: `demo`,
  businessName: `BotNest AI Assistant`,
  welcomeMessage: `Hi! I’m your AI assistant. I can answer questions and help guide you to booking or contacting the business.`,
  tone: `friendly`,
  services: [`General questions`, `Booking help`, `Service info`],
  bookingLink: `https://calendly.com/rick-bot-nest/30min`,
  leadCaptureEnabled: true,
  fallbackContact: `Contact us through the website to learn more.`,
  market: `us`,
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

const QUICK_REPLY_ACTIONS = new Set(['book', 'services', 'ask']);
const MAX_QUICK_REPLIES = 4;

type QuickReply = { label: string; message?: string; action?: 'book' | 'services' | 'ask' };

/**
 * Validates the `bots.quick_replies` jsonb column into a safe shape for the widget.
 * Anything malformed (wrong types, empty labels, too many entries) is dropped rather than
 * sent to the browser — the widget falls back to its built-in defaults when this is undefined.
 */
function toQuickReplies(value: unknown): QuickReply[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const items: QuickReply[] = [];
  for (const raw of value) {
    if (items.length >= MAX_QUICK_REPLIES) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 60) : '';
    if (!label) continue;
    const entry: QuickReply = { label };
    if (typeof item.message === 'string' && item.message.trim()) entry.message = item.message.trim().slice(0, 500);
    if (typeof item.action === 'string' && QUICK_REPLY_ACTIONS.has(item.action)) {
      entry.action = item.action as QuickReply['action'];
    }
    items.push(entry);
  }
  return items.length > 0 ? items : undefined;
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
    market: botConfig.market || 'us',
    quickReplies: toQuickReplies(botConfig.quick_replies),
  };
}

export function createConfigRouter(): Router {
  const router = Router();

  // Resolve a Stripe checkout session_id → botId so the success page can show the embed code
  router.get('/session/:sessionId/bot', async (req: Request<{ sessionId: string }>, res: Response, next: NextFunction) => {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(500).json({ error: 'Server misconfiguration' });

      const stripe = new Stripe(stripeKey);
      const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
        expand: ['metadata'],
      });

      // For new checkouts the botId is not in session metadata — look up by subscription ID
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      let botConfig: BotConfigRow | null = null;

      if (subscriptionId) {
        botConfig = await getBotByStripeSubscriptionId(subscriptionId).catch(() => null);
      }

      // Fallback: check if metadata has an explicit botId (existing bot reactivation flow)
      if (!botConfig && session.metadata?.botId) {
        botConfig = await getBotConfig(session.metadata.botId).catch(() => null);
      }

      if (!botConfig) {
        // Webhook may not have fired yet — tell the client to retry
        return res.status(202).json({ status: 'pending', message: 'Bot is being set up. Retry in a few seconds.' });
      }

      return res.json({
        botId: botConfig.id,
        businessName: botConfig.business_name || 'Your Business',
        market: botConfig.market || 'us',
        website: botConfig.website,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/config/:botId', async (req: Request<{ botId: string }>, res: Response, next: NextFunction) => {
    try {
      const { botId } = req.params;
      const botConfig = await getBotConfig(botId);

      // Origin gate first so a foreign page learns nothing (not even active/inactive) about a restricted bot.
      if (!enforceBotOrigin(req, res, botConfig, botId)) return;

      if (botConfig.is_active === false) {
        return res.status(403).json({ error: 'inactive' });
      }

      return res.json(toFrontendBotConfig(botId, botConfig));
    } catch (err) {
      if (err instanceof BotNotFoundError) {
        // Unknown/demo bot ids follow the legacy (global FRONTEND_ORIGINS) rule.
        if (!enforceBotOrigin(req, res, null, req.params.botId)) return;
        return res.status(200).json(DEMO_FALLBACK_CONFIG);
      }
      return next(err);
    }
  });

  return router;
}
