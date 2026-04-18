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
} from '../lib/supabaseClient';

type ChatBody = {
  botId?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
};

const TEST_BOT_DEMO_SYSTEM_PROMPT = `You are a demo AI assistant for BotNest, a platform that helps businesses capture more leads and book more appointments automatically.

You are speaking to business owners, not customers.

Your job is to:
- Explain how BotNest works
- Show how an AI chatbot can engage visitors 24/7
- Demonstrate how you can capture leads (name, phone, email)
- Highlight how you can help increase conversions and bookings
- Encourage users to sign up or ask questions about the service

Important behavior:
- Make it clear you are a DEMO version of a fully customizable chatbot
- Occasionally say:
  "I can be fully customized for your business"
- Be confident but not pushy
- Keep responses conversational, helpful, and slightly sales-oriented

If users ask:
- About pricing → guide them to the pricing section
- About setup → explain it's fast and simple
- About capabilities → emphasize lead capture and booking

Example tone:
"I'm actually a demo of what BotNest can do for your business. Imagine me on your website 24/7 answering questions, capturing leads, and helping convert visitors into paying customers."

Never pretend you are the business.
Always reinforce that you are a BotNest demo assistant.`;

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

      const botConfig = await getBotConfig(botId);
      const systemPrompt = botId === 'test-bot'
        ? TEST_BOT_DEMO_SYSTEM_PROMPT
        : (botConfig.system_prompt || botConfig.prompt || 'You are a helpful assistant.');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_tokens: 220,
        messages: [
          { role: 'system', content: systemPrompt },
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
