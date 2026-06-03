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
import {
  getOrCreateConversation,
  getRecentMessages,
  appendMessage,
  incrementTurns,
} from '../lib/memory';
import { searchKnowledge, formatKnowledgeForContext } from '../lib/knowledgeSearch';
import { TOOL_DEFINITIONS, executeTool, ToolContext } from '../lib/tools';

// ─── Request / Response types ────────────────────────────────────────────────

type ChatBody = {
  botId?: string;
  message?: string;                             // preferred: single latest message
  messages?: Array<{ role: string; content: string }>; // legacy: full history from widget
  sessionId?: string;
  context?: {
    industry?: string;
    turnCount?: number;
    leadCaptured?: boolean;
  };
};

// ─── Usage limits ─────────────────────────────────────────────────────────────

const USAGE_LIMIT_FALLBACK_US = `We're currently assisting other clients, but we'd love to help. What's your name and best phone number?`;
const USAGE_LIMIT_FALLBACK_VN = `Trợ lý này đã đạt giới hạn sử dụng trong tháng. Vui lòng liên hệ doanh nghiệp để được hỗ trợ trực tiếp.`;

function parseUsageValue(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : defaultValue;
}

// ─── System prompts ───────────────────────────────────────────────────────────

function buildDemoPrompt(): string {
  return `You are a BotNest AI sales consultant. You are a consultant first, salesperson second.

LANGUAGE: Detect the visitor's language from their message and respond in that same language.

WHAT BOTNEST DOES:
BotNest helps service businesses capture more leads, automate bookings, manage reviews, and qualify prospects through AI assistants on their website.

Services:
- AI Website Chatbots: Capture and qualify leads 24/7
- Reputation Shield: Manage, improve, and protect online reviews
- Lead Capture & Qualification: Filter prospects before the sales call
- White-Label AI: Branded AI solutions for agencies
- Industry-Specific Assistants: Built for dental, legal, med spa, real estate, restaurants

CONVERSATION STAGES:
Stage 1 (first 1–2 turns): Understand their situation before advising. Ask what type of business they run if unknown.
Stage 2 (mid-conversation): Connect their specific situation to a BotNest outcome. Be concrete.
Stage 3 (clear interest): When genuine interest is evident, offer the demo naturally.

QUALIFICATION:
High intent: specific problem + asks about pricing or getting started → be more direct.
Medium intent: curious, exploring → educate and ask one discovery question.
Low/exit intent: "just looking", "send me info" → keep alive with one question.

TOOL USAGE:
- Use search_knowledge for any factual question about BotNest services, pricing, or policies.
- Use capture_lead only after the visitor voluntarily provides their name and contact.
- Use get_booking_link when the visitor is ready to schedule.
- Use escalate_to_human only when explicitly requested or situation is beyond your ability.

OBJECTION HANDLING:
Recognize objections from meaning and context. When you detect any:
1. Acknowledge genuinely.
2. Ask one question to surface the real concern.
3. Reframe with a specific ROI example for their industry:
   - Dental/Med Spa: 2–3 extra bookings/month covers the cost.
   - Law firm: One retained client covers months.
   - Real estate: 5–10 hours/week saved on qualification.
   - Restaurant: After-hours reservations automated.
4. Offer a soft next step after the reframe.

EXIT INTENT: One empathetic sentence + one specific question to re-engage. Never let the conversation end on their exit phrase.

CONTEXT AWARENESS: Use conversation history. Never ask for information already given.

HARD RULES:
- Never say "I will check availability", "We will contact you", or "Someone will reach out"
- For explicit booking: use get_booking_link tool
- 2–4 sentences per response
- End every response with a question or clear next step
- Never acknowledge that a framework exists`;
}

function buildDynamicPrompt(
  businessName?: string,
  industry?: string,
  description?: string,
  market = 'us',
): string {
  const name = (businessName || 'this business').trim();
  const domain = (industry || 'general services').trim();
  const details = (description || '').trim();
  const langRule = market === 'vn'
    ? '\nLANGUAGE: Respond in Vietnamese (Tiếng Việt) unless the visitor writes in another language.\n'
    : '\nLANGUAGE: Detect the visitor\'s language and respond in kind.\n';

  return `You are an AI assistant for ${name}.

Business type: ${domain}
${details ? `Description: ${details}` : ''}
${langRule}
TOOL USAGE:
- Use search_knowledge before answering factual questions about this business.
- Use capture_lead after the visitor voluntarily provides contact info.
- Use get_booking_link when they want to schedule.
- Use escalate_to_human if the situation requires a human.

RULES:
- Be truthful — never claim actions not actually executed.
- Never say "I will check availability", "We will contact you", "Someone will reach out".
- Keep replies to 2–3 sentences.
- End every response with a question or a clear next step.
- Detect the visitor's language and respond in kind.

OBJECTION HANDLING:
When you detect any hesitation, price concern, or doubt — acknowledge first, ask one question, then reframe with specific value. Never dismiss or immediately deflect.

CONTEXT AWARENESS: Use conversation history. Do not re-ask for information already given.`;
}

// ─── Agentic chat loop ────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 4;

async function runAgentLoop(
  openai: OpenAI,
  systemPrompt: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  toolCtx: ToolContext,
  hasKnowledge: boolean,
): Promise<{ reply: string; toolsSideEffect?: string }> {
  let iterationMessages = [...messages];
  let lastSideEffect: string | undefined;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        ...iterationMessages,
      ],
      tools: hasKnowledge ? TOOL_DEFINITIONS : TOOL_DEFINITIONS.filter(
        (t) => t.function.name !== 'search_knowledge',
      ),
      tool_choice: 'auto',
    });

    const choice = completion.choices[0];

    // No tool call — return text response
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      return {
        reply: choice.message.content ?? '',
        toolsSideEffect: lastSideEffect,
      };
    }

    // Process tool calls
    const toolCall = choice.message.tool_calls[0];
    const toolName = toolCall.function.name;
    let toolArgs: Record<string, unknown> = {};
    try {
      toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      toolArgs = {};
    }

    const toolResult = await executeTool(toolName, toolArgs, toolCtx);
    if (toolResult.sideEffect) lastSideEffect = toolResult.sideEffect;

    // Persist tool call + result to DB (non-blocking)
    void appendMessage(toolCtx.conversationId, 'tool', toolResult.output, {
      name: toolName,
      input: toolArgs,
      output: { text: toolResult.output },
    });

    // Build next iteration messages
    iterationMessages = [
      ...iterationMessages,
      {
        role: 'assistant' as const,
        tool_calls: choice.message.tool_calls,
        content: null,
      },
      {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: toolResult.output,
      },
    ];
  }

  // Exhausted iterations — get final response without tool calls
  const final = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    max_tokens: 400,
    messages: [{ role: 'system', content: systemPrompt }, ...iterationMessages],
  });

  return {
    reply: final.choices[0].message.content ?? '',
    toolsSideEffect: lastSideEffect,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export function createChatRouter(openai: OpenAI): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ChatBody;
      const { botId, sessionId, context } = body;

      // Support both single-message and legacy full-history format
      const latestMessage = body.message
        || (Array.isArray(body.messages) ? body.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content : undefined)
        || '';

      if (!botId) return res.status(400).json({ error: 'botId is required' });
      if (!latestMessage) return res.status(400).json({ error: 'message is required' });

      // ── Load bot config ──────────────────────────────────────────────────
      let isDemo = false;
      let botConfig: Awaited<ReturnType<typeof getBotConfig>> | undefined;
      let market = 'us';

      try {
        botConfig = await getBotConfig(botId);
        market = botConfig.market || 'us';

        if (botConfig.is_active === false) {
          return res.status(403).json({
            error: 'inactive',
            reply: 'This assistant is temporarily unavailable. Please contact the business directly.',
          });
        }

        const usageLimit = parseUsageValue(botConfig.usage_limit, Number.MAX_SAFE_INTEGER);
        const usageCount = parseUsageValue(botConfig.usage_count, 0);

        if (usageCount >= usageLimit) {
          const fallback = market === 'vn' ? USAGE_LIMIT_FALLBACK_VN : USAGE_LIMIT_FALLBACK_US;
          return res.json({ reply: fallback, botId });
        }
      } catch (err) {
        if (err instanceof BotNotFoundError) {
          isDemo = true;
        } else {
          throw err;
        }
      }

      // ── Conversation memory ───────────────────────────────────────────────
      let conversationId: string | null = null;
      let dbMessages: Array<{ role: string; content: string }> = [];

      if (sessionId) {
        try {
          const conv = await getOrCreateConversation(botId, sessionId);
          conversationId = conv.id;

          // Persist user message
          await appendMessage(conv.id, 'user', latestMessage);

          // Fetch recent history (including the message we just added)
          dbMessages = await getRecentMessages(conv.id, 20);

          void incrementTurns(conv.id);
        } catch (err) {
          // Memory failure is non-fatal — degrade to stateless mode
          console.error('[chat] Memory error (degrading to stateless):', err);
          conversationId = null;
        }
      }

      // ── Build messages for OpenAI ─────────────────────────────────────────
      let oaiMessages: OpenAI.ChatCompletionMessageParam[];

      if (dbMessages.length > 0) {
        // DB-backed history (preferred)
        oaiMessages = dbMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      } else {
        // Legacy: use client-sent messages or just the single message
        const legacy = Array.isArray(body.messages) && body.messages.length > 0
          ? body.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          : [{ role: 'user' as const, content: latestMessage }];
        oaiMessages = legacy;
      }

      // ── RAG: inject relevant knowledge ────────────────────────────────────
      let knowledgeContext = '';
      let hasKnowledge = false;
      if (!isDemo) {
        try {
          const results = await searchKnowledge(botId, latestMessage, null, 4);
          knowledgeContext = formatKnowledgeForContext(results);
          hasKnowledge = results.length > 0;
        } catch {
          // RAG failure is non-fatal
        }
      }

      // ── Build system prompt ───────────────────────────────────────────────
      let systemPrompt = isDemo
        ? buildDemoPrompt()
        : buildDynamicPrompt(
            botConfig?.business_name,
            botConfig?.industry,
            botConfig?.description,
            market,
          );

      if (knowledgeContext) {
        systemPrompt += `\n\n${knowledgeContext}`;
      }

      // Inject conversation metadata if available
      const ctxParts: string[] = [];
      if (context?.industry) ctxParts.push(`Visitor's business: ${context.industry}`);
      if (context?.leadCaptured) ctxParts.push('Contact already captured — focus on next step');
      if (ctxParts.length > 0) {
        systemPrompt += `\n\n[Session context: ${ctxParts.join('. ')}]`;
      }

      // ── Tool context ──────────────────────────────────────────────────────
      const toolCtx: ToolContext = {
        botId,
        conversationId: conversationId ?? `ephemeral-${Date.now()}`,
        bookingLink: botConfig?.booking_link || undefined,
        notificationEmail: botConfig?.notification_email || undefined,
        businessName: botConfig?.business_name || undefined,
      };

      // ── Run agentic loop ──────────────────────────────────────────────────
      const { reply } = await runAgentLoop(
        openai,
        systemPrompt,
        oaiMessages,
        toolCtx,
        hasKnowledge,
      );

      // ── Persist assistant response ────────────────────────────────────────
      if (conversationId) {
        void appendMessage(conversationId, 'assistant', reply);
      }

      // ── Increment usage ───────────────────────────────────────────────────
      if (botConfig) {
        void incrementBotUsageCount(botConfig);
      }

      return res.json({ reply, botId });

    } catch (err) {
      if (err instanceof BotNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
