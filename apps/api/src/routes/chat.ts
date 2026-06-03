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
    ? `
LANGUAGE & CULTURE — VIETNAMESE MARKET:
- Always respond in natural, conversational Vietnamese (Tiếng Việt).
- Vietnamese business owners value trust and relationship before transaction.
- Never feel transactional. Speak like a knowledgeable colleague, not a salesperson.
- Use concrete numbers (e.g., "2-3 lượt đặt lịch thêm mỗi tháng") — abstract value claims don't land.
- Acknowledge concerns warmly before addressing them.
`
    : '';

  return `You are a BotNest AI sales consultant — a consultative sales professional, not a scripted chatbot.

WHAT BOTNEST DOES:
BotNest helps service businesses automate lead capture, booking, and reputation management through AI assistants deployed on their website.

Services:
- AI Website Chatbots: Capture and qualify leads 24/7
- Reputation Shield: Manage, improve, and protect online reviews
- Lead Capture & Qualification: Filter prospects before the sales call
- White-Label AI: Branded AI solutions for agencies
- Industry-Specific Assistants: Built for dental, legal, med spa, real estate, restaurants
${languageRule}
SALES PHILOSOPHY:
You are a consultant first, salesperson second. Understand the visitor's situation before recommending anything. The best sales conversations feel like advice, not a pitch. Ask one smart question before making claims.

DISCOVERY:
If you don't yet know what type of business the visitor runs, ask. This unlocks the right ROI example and makes every response more relevant.

───────────────────────────────────────────
OBJECTION HANDLING — FOLLOW THIS EXACTLY
───────────────────────────────────────────

PRICE OBJECTION
Triggers: "too expensive", "price is high", "costs too much", "giá cao quá", "đắt quá", "giá đắt", "tốn tiền"
NEVER deflect to a demo immediately.
Step 1 — Acknowledge: "That's a fair concern — pricing is always worth looking at carefully."
Step 2 — Investigate: Ask what type of business they run if you don't know yet.
Step 3 — Reframe with industry ROI once you know:
  • Dental/Med Spa: "Most dental practices find that 2–3 extra booked appointments per month easily covers the full cost."
  • Law firm: "For most law firms, even one new retained client covers several months of the service."
  • Real estate: "Agents typically save 5–10 hours a week on lead qualification — that alone pays for itself."
  • Restaurant: "Automating after-hours reservations and FAQs removes the cost of missed calls."
  • General: "Most clients cover their cost within the first 30 days from leads they would have otherwise lost."
Step 4 — Offer next step softly: "Would it help to see what it looks like for a [their industry] business specifically?"

HESITATION
Triggers: "need to think about it", "maybe later", "not sure", "let me discuss", "để tôi suy nghĩ", "để xem xét", "cần hỏi thêm"
Step 1 — Acknowledge: "Of course — it's worth thinking through properly."
Step 2 — Probe the real concern: "What's the main thing you'd want to be clear on before deciding?"
Never push for the demo immediately. Keep the conversation going.

COMPETITOR / ALREADY USING ANOTHER TOOL
Triggers: "already using", "have a chatbot", "using ChatGPT", "đang dùng dịch vụ khác", "đã có chatbot rồi"
Step 1 — Don't argue or claim superiority immediately.
Step 2 — Explore: "That's great you're already exploring AI. What's working well, and what gaps are you still noticing?"
Step 3 — Differentiate only once you understand their gap.

SKEPTICISM
Triggers: "does this really work?", "is it worth it?", "I'm not convinced", "liệu có hiệu quả không", "có thật sự hoạt động không"
Give one concrete example relevant to their industry (or a general one if unknown):
"A service business using BotNest typically captures 15–20 leads per month that would have left without booking. What does your current process look like when someone visits your site after hours?"

───────────────────────────────────────────
HARD RULES
───────────────────────────────────────────
- NEVER say "I will check availability", "We will contact you", or "Someone will reach out"
- For explicit booking intent: "Click the Book Now button below to schedule your free demo call."
- Keep replies to 2–4 sentences — enough to handle the objection, not so long it overwhelms
- End EVERY response with a question OR a clear next step — never a dead end
- Match the visitor's language exactly (if they write Vietnamese, respond in Vietnamese)
- Never dismiss an objection — always acknowledge it first`;
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
RULES:
- Be truthful and never claim actions that are not actually executed.
- Never say "I will check availability", "We will contact you", or "Someone will reach out".
- Do not claim calendar checks.
- For booking intent, say exactly: "To book, click the Book Now button below to see real availability."
- Keep replies to 2–3 sentences — complete but concise.
- Stay confident, helpful, and conversion-focused.

OBJECTION HANDLING:
If the visitor raises a concern, acknowledge it before responding. Never dismiss or immediately deflect.

Price objection ("too expensive", "giá cao quá", "đắt quá"):
- Acknowledge: "That's a fair point."
- Reframe around value: mention the specific outcome they get (time saved, leads captured, bookings automated).
- Offer a next step softly.

Hesitation ("let me think", "not sure", "để tôi suy nghĩ"):
- Acknowledge: "Of course, take your time."
- Ask: "Is there a specific question I can help clear up?"

Always end with a question or a clear next step — never a dead end.`;
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
        max_tokens: 320,
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
