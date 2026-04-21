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
  UsageIncrementConflictError,
} from '../lib/supabaseClient';

type ChatBody = {
  botId?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
};

const USAGE_LIMIT_FALLBACK_MESSAGE = 'Thanks for reaching out. Please leave your name and phone number and the business will contact you.';

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

  return [
    `You are the AI assistant for ${name}.`,
    `Industry: ${domain}.`,
    `Business description: ${details}.`,
    'Be concise, accurate, and helpful. If you are unsure, ask a clarifying question.',
  ].join(' ');
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

      let botConfig = await getBotConfig(botId);
      const usageLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
      const usageCount = parseUsageValue(botConfig.usage_count, 0);

      if (usageCount >= usageLimit) {
        return res.json({
          reply: USAGE_LIMIT_FALLBACK_MESSAGE,
          botId,
          usageLimited: true,
        });
      }

      // Reserve one usage slot before calling OpenAI so every call is tracked in Supabase.
      try {
        await incrementBotUsageCount(botId, usageCount);
      } catch (err) {
        if (err instanceof UsageIncrementConflictError) {
          // Retry once with fresh usage values if another request updated usage concurrently.
          botConfig = await getBotConfig(botId);
          const refreshedLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
          const refreshedCount = parseUsageValue(botConfig.usage_count, 0);

          if (refreshedCount >= refreshedLimit) {
            return res.json({
              reply: USAGE_LIMIT_FALLBACK_MESSAGE,
              botId,
              usageLimited: true,
            });
          }

          await incrementBotUsageCount(botId, refreshedCount);
        } else {
          throw err;
        }
      }

      const dynamicPrompt = buildDynamicPrompt(
        botConfig.business_name,
        botConfig.industry,
        botConfig.description,
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
