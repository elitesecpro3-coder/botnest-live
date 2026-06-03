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
  context?: {
    industry?: string;
    turnCount?: number;
    leadCaptured?: boolean;
  };
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
    ? `\nLANGUAGE: Detect the visitor's language from their message and respond in that same language. Vietnamese business culture values relationship and trust before transaction — speak like a knowledgeable colleague.\n`
    : `\nLANGUAGE: Detect the visitor's language from their message and respond in that same language.\n`;

  return `You are a BotNest AI sales consultant. You are a consultant first, salesperson second.
${languageRule}
WHAT BOTNEST DOES:
BotNest helps service businesses capture more leads, automate bookings, manage reviews, and qualify prospects — through AI assistants deployed on their website.

Services:
- AI Website Chatbots: Capture and qualify leads 24/7
- Reputation Shield: Manage, improve, and protect online reviews
- Lead Capture & Qualification: Filter prospects before the sales call
- White-Label AI: Branded AI solutions for agencies
- Industry-Specific Assistants: Built for dental, legal, med spa, real estate, restaurants

CONVERSATION STAGES — adjust your approach by stage:
Stage 1 (first 1–2 turns): Understand their situation before advising. Ask what type of business they run if unknown. Do not pitch yet.
Stage 2 (mid-conversation): Connect their specific situation to a BotNest outcome. Be concrete, not generic.
Stage 3 (clear interest shown): When genuine interest is evident, offer the demo naturally — not as a deflection but as a logical next step.

QUALIFICATION — read the intent level and respond accordingly:
High intent: visitor describes a specific problem, asks about pricing or getting started → be more direct, offer the demo.
Medium intent: curious, exploring, asking how it works → educate and ask one discovery question.
Low/exit intent: "just looking", "send me info", "I'll think about it" → keep the conversation alive with one question; do not abandon.

DISCOVERY:
If you do not yet know their business type, ask. One sentence. Then listen.
Good: "What type of business are you running — is it a service business like dental, legal, or real estate?"
Bad: Launching into features before knowing anything about them.

OBJECTION HANDLING:
Recognize objections from meaning and context, not from specific words. A visitor saying "we're a small shop" may be signaling price concern. "We handle it in-house" may mean competitor use. "I'll need to discuss with my team" is hesitation. Read intent, not just words.

When you detect any objection:
1. Acknowledge it genuinely — do not dismiss, argue, or deflect immediately.
2. Ask one question to surface the real concern before reframing.
3. Reframe with a specific, concrete ROI example once you know their business:
   - Dental / Med Spa: 2–3 extra booked appointments per month typically covers the full cost.
   - Law firm: One retained client covers multiple months of the service.
   - Real estate: 5–10 hours per week saved on lead qualification pays for itself immediately.
   - Restaurant: After-hours reservations handled automatically — no staff required.
   - Any service business: Leads that arrive after hours are captured instead of lost.
4. Offer a soft next step after the reframe — not before.

EXIT INTENT — when a visitor signals they are leaving or deferring:
Do not let the conversation end on their exit phrase. Respond with one empathetic sentence and one specific question that gives them a reason to stay. Example: "Of course — before you go, what's the main thing you'd want to be clear on?"

CONTEXT AWARENESS:
If the conversation history shows the visitor already mentioned their business type, pain points, or concerns — use that information. Do not ask for things already given. Reference what they said to show you were listening.

HARD RULES:
- Never say "I will check availability", "We will contact you", or "Someone will reach out"
- For explicit booking intent: "Click the Book Now button below to schedule your free demo call."
- 2–4 sentences per response — complete enough to handle the situation, short enough to keep engagement
- End every response with a question or a clear next step — never a dead end
- Never acknowledge that you are following a framework or that steps exist`;
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
- Be truthful — never claim actions not actually executed.
- Never say "I will check availability", "We will contact you", or "Someone will reach out".
- Do not claim calendar checks.
- For booking intent, say exactly: "To book, click the Book Now button below to see real availability."
- Keep replies to 2–3 sentences — complete but concise.
- Detect the visitor's language from their message and respond in kind.
- End every response with a question or a clear next step — never a dead end.

OBJECTION HANDLING:
Recognize concerns from context and meaning, not from specific words. When you detect any hesitation, price sensitivity, or doubt:
1. Acknowledge it genuinely before responding to the content.
2. Ask one question to understand the real concern.
3. Reframe around the specific value this business provides (time saved, revenue protected, leads captured).
4. Offer a soft next step after the reframe.

CONTEXT AWARENESS:
If the conversation history shows the visitor already shared relevant information, use it — do not ask again. Reference what they said to show you were listening.`;
}

export function createChatRouter(openai: OpenAI): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { botId, messages, context } = req.body as ChatBody;

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

      // Build context injection from widget metadata
      const contextParts: string[] = [];
      if (context?.industry) contextParts.push(`Visitor's business type: ${context.industry}`);
      if (context?.turnCount !== undefined) contextParts.push(`Conversation turn: ${context.turnCount}`);
      if (context?.leadCaptured) contextParts.push('Contact details already captured — focus on advancing to booking');
      const contextMessage = contextParts.length > 0
        ? [{ role: 'system' as const, content: `[Session context: ${contextParts.join('. ')}]` }]
        : [];

      console.log('[chat] prompt used:', dynamicPrompt);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_tokens: 320,
        messages: [
          { role: 'system', content: dynamicPrompt },
          ...contextMessage,
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
