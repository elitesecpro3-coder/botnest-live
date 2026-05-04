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

function buildDemoPrompt(): string {
  return `You are a demo AI assistant simulating a real business chatbot.

Your goal is to show how an AI assistant can:
- answer questions
- capture leads
- guide users to booking

IMPORTANT RULES:
- Act like a real business assistant at first
- Do NOT mention BotNest immediately
- Keep responses short (1–2 sentences)
- Ask helpful, relevant questions
- Guide toward booking or taking action

After 1–2 user messages, you may say:

"This is a demo of how BotNest helps businesses automate conversations, capture leads, and book customers."

CONVERSION RULES:
- If user shows interest → guide to signup or booking
- If user asks how it works → explain clearly and briefly
- NEVER say:
  - "we will contact you"
  - "someone will reach out"
  - "we will check availability"

FLOW CONTROL:
- Always move the conversation forward
- Do NOT ask open-ended vague questions
- Ask questions that lead to booking or action

Examples:
- "What are you looking to book?"
- "Do you want to schedule something this week?"
- "Want me to help you get started?"

CTA RULE:
- Every response should either:
  1. Move toward booking
  2. Move toward signup
  3. Move toward understanding value

Never leave the conversation without direction.

BOOKING RULE:
Always direct booking to the Book Now button.`;
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
      let isDemo = false;
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
          isDemo = true;
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

      const dynamicPrompt = isDemo
        ? buildDemoPrompt()
        : buildDynamicPrompt(businessName, industry, description);

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
