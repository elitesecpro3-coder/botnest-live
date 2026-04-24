import {
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';
import OpenAI from 'openai';

import {
  BotNotFoundError,
  getBotConfig,
  incrementBotUsageCount,
} from '../lib/supabaseClient';

type ChatBody = {
  botId?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
};

const DEMO_FALLBACK_CONFIG = {
  botId: 'demo',
  businessName: 'BotNest AI Assistant',
  welcomeMessage: 'Hi! I’m your AI assistant. I can answer questions and help guide you to booking or contacting the business.',
  tone: 'friendly',
  services: ['General questions', 'Booking help', 'Service info'],
  bookingLink: 'https://calendly.com/rick-bot-nest/30min',
  leadCaptureEnabled: true,
  fallbackContact: 'Contact us through the website to learn more.'
};

const USAGE_LIMIT_FALLBACK_MESSAGE = 'We’re currently assisting other clients, but we’d love to help. What’s your name and best phone number?';

function parseUsageValue(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

function buildDynamicPrompt(
  businessName?: string,
  industry?: string,
  description?: string,
): string {
  const name = (businessName || 'this business').trim();
  const domain = (industry || 'general services').trim();
  const details = (description || 'No additional business description provided.').trim();

  return `You are an AI assistant for ${name}.

Business type: ${domain}
Description: ${details}

Context:
- This assistant is on the BotNest website.
- BotNest provides AI chatbots, lead capture, automation, pricing options, and conversion-focused support.

Rules:
- Be truthful and never claim actions that are not actually executed.
- Never say "I will check availability", "We will contact you", or "Someone will reach out".
- Do not claim calendar checks.
- For booking intent, say exactly: "To book, click the Book Now button below to see real availability."
- Keep each reply to 1-2 short sentences.
- Stay confident, helpful, and conversion-focused.
- Move the user to either booking or the next relevant question.`;
}

export function createChatRouter(openai: OpenAI): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId, messages } = req.body as ChatBody;

      if (!botId) {
        return res.status(400).json({ error: 'botId is required' });
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' });
      }

      console.log('[chat] botId:', botId);

      let usageLimit = Number.MAX_SAFE_INTEGER;
      let usageCount = 0;
      let businessName: string | undefined;
      let industry: string | undefined;
      let description: string | undefined;
      let botConfigForUsage: Awaited<ReturnType<typeof getBotConfig>> | undefined;

      try {
        const botConfig = await getBotConfig(botId);
        botConfigForUsage = botConfig;
        usageLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
        usageCount = parseUsageValue(botConfig.usage_count, 0);
        businessName = botConfig.business_name;
        industry = botConfig.industry;
        description = botConfig.description;
      } catch (err) {
        if (err instanceof BotNotFoundError) {
          businessName = DEMO_FALLBACK_CONFIG.businessName;
          industry = 'General';
          description = DEMO_FALLBACK_CONFIG.welcomeMessage;
        } else {
          throw err;
        }
      }

      console.log('[usage] current:', usageCount);
      console.log('[usage] limit:', usageLimit);

      if (usageCount >= usageLimit) {
        return res.json({
          message: USAGE_LIMIT_FALLBACK_MESSAGE,
          reply: USAGE_LIMIT_FALLBACK_MESSAGE,
        });
      }

      const dynamicPrompt = buildDynamicPrompt(
        businessName,
        industry,
        description,
      );

      console.log('[chat] prompt used:', dynamicPrompt);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_tokens: 220,
        messages: [
          { role: 'system', content: dynamicPrompt },
          ...messages,
        ],
      });

      if (botConfigForUsage) {
        await incrementBotUsageCount(botConfigForUsage);
      }

      return res.json({
        reply: completion.choices[0].message?.content ?? '',
        botId,
      });
    } catch (err) {
      if (err instanceof BotNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
