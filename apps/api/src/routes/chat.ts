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

Your goal is to:
- answer questions clearly and confidently
- guide users toward booking or taking action
- capture the user's name and phone number when appropriate

Rules:
- Be natural and conversational (not robotic)
- Avoid generic responses
- Ask follow-up questions when helpful
- Always try to move the conversation toward booking or lead capture

If the user shows interest, ask:
"What’s the best number to reach you?"

Keep responses concise and helpful.`;
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

      const botConfig = await getBotConfig(botId);
      const usageLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
      const usageCount = parseUsageValue(botConfig.usage_count, 0);

      console.log('[usage] current:', usageCount);
      console.log('[usage] limit:', usageLimit);

      if (usageCount >= usageLimit) {
        return res.json({
          message: USAGE_LIMIT_FALLBACK_MESSAGE,
          reply: USAGE_LIMIT_FALLBACK_MESSAGE,
        });
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

      await incrementBotUsageCount(botConfig);

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
