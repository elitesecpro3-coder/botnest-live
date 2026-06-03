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

const USAGE_LIMIT_FALLBACK_MESSAGE_US = `We’re currently assisting other clients, but we’d love to help. What’s your name and best phone number?`;
const USAGE_LIMIT_FALLBACK_MESSAGE_VN = `Trợ lý này đã đạt giới hạn sử dụng trong tháng. Vui lòng liên hệ doanh nghiệp để được hỗ trợ trực tiếp.`;

function parseUsageValue(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

function buildDemoPrompt(market: string = 'us'): string {
  const languageRule = market === 'vn'
    ? `\nIMPORTANT LANGUAGE RULE:
This demo is for a Vietnamese-market audience.
Always respond in natural Vietnamese (Tiếng Việt).
Keep replies short, helpful, and conversion-focused.\n`
    : '';

  return `You are a BotNest AI sales assistant — a live demo of the BotNest chatbot platform.
${languageRule}
BotNest Services:
- AI Website Chatbots: Capture leads and book appointments 24/7 on any website
- Reputation Shield: Automated review management — protect and grow your star rating
- Lead Capture & Qualification: Smart conversations that qualify prospects before the sales call
- White-Label AI Solutions: Custom-branded AI assistants for agencies and resellers
- Industry-Specific AI Assistants: Specialized bots for medical, legal, real estate, and service businesses

Your role:
- You ARE the BotNest demo — show its value through this conversation
- Answer questions about BotNest's services confidently and specifically
- Guide visitors toward booking a demo call or getting started

RULES:
- Keep replies to 1–2 short sentences
- NEVER say "I will check availability", "We will contact you", or "Someone will reach out"
- For booking, say exactly: "Click the Book Now button below to schedule your free demo call."
- Be specific — you know BotNest's services, pricing model, and value
- Always end with a question or a clear next step

CONVERSION RULES:
- If user asks about a specific service → explain it in one sentence, then ask which industry they're in
- If user asks about pricing → say "Plans start based on usage — the Book Now button will get you a custom quote in under 10 minutes."
- If user asks how it works → "You add one script tag to your website and your AI assistant goes live instantly."
- Always move toward booking the demo call`;
}

function buildDynamicPrompt(
  businessName?: string,
  industry?: string,
  description?: string,
  market: string = 'us',
): string {
  const name = (businessName || 'this business').trim();
  const domain = (industry || 'general services').trim();
  const details = (description || 'No additional business description provided.').trim();

  const languageRule = market === 'vn'
    ? `\nIMPORTANT LANGUAGE RULE:
This bot is for a Vietnamese-market business.
Always respond in natural Vietnamese (Tiếng Việt), unless the business owner specifically configured otherwise.
Keep replies short, helpful, and conversion-focused.\n`
    : '';

  return `You are an AI assistant for ${name}.

Business type: ${domain}
Description: ${details}
${languageRule}
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
      let market = 'us';
      let botConfigForUsage: Awaited<ReturnType<typeof getBotConfig>> | undefined;

      try {
        const botConfig = await getBotConfig(botId);
        botConfigForUsage = botConfig;

        if (botConfig.is_active === false) {
          return res.status(403).json({
            error: 'inactive',
            reply: 'This assistant is temporarily unavailable. Please contact the business directly.',
          });
        }

        usageLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
        usageCount = parseUsageValue(botConfig.usage_count, 0);
        businessName = botConfig.business_name;
        industry = botConfig.industry;
        description = botConfig.description;
        market = botConfig.market || 'us';
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
        const usageLimitMessage = market === 'vn'
          ? USAGE_LIMIT_FALLBACK_MESSAGE_VN
          : USAGE_LIMIT_FALLBACK_MESSAGE_US;
        return res.json({
          message: usageLimitMessage,
          reply: usageLimitMessage,
        });
      }

      const dynamicPrompt = isDemo
        ? buildDemoPrompt(market)
        : buildDynamicPrompt(businessName, industry, description, market);

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
