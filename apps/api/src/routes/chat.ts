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

function buildDemoPrompt(_market = 'us'): string {
  // Always include both market pricing — language detection determines which to quote.
  // The BotNest promotional bot serves both /vi (VN) and / (EN) pages.
  const pricingBlock = `PRICING — CRITICAL RULE: always quote the price for the visitor's market.
Vietnamese visitors (writing in Vietnamese) → Vietnam market prices ONLY:
- Gói Starter: $39 USD/tháng (khoảng 999.000₫)
- Gói Pro: $79 USD/tháng (khoảng 2.000.000₫)
- Bảo đảm hoàn tiền 5 ngày
English visitors → US market prices:
- Starter: $149/month | Pro: $299/month | 15-day guarantee

DO NOT mix markets. A Vietnamese visitor must NEVER see $149 or $299.
If knowledge base returns US prices and visitor is Vietnamese, ignore those prices and use $39/$79 instead.`;

  const langRule = 'LANGUAGE: Detect the visitor\'s language from their first message and respond in that same language throughout.';

  const objectionROI = `   - Dental/Med Spa / Nha khoa/Spa: 2–3 extra bookings/month covers the cost.
   - Law firm / Công ty luật: One retained client covers months.
   - Real estate / Bất động sản: 5–10 hours/week saved on qualification.
   - Restaurant / Nhà hàng: After-hours reservations automated.`;

  return `You are a BotNest AI sales consultant. You are a consultant first, salesperson second.

${langRule}

WHAT BOTNEST DOES:
BotNest helps service businesses capture more leads, automate bookings, manage reviews, and qualify prospects through AI assistants on their website.

Services:
- AI Website Chatbots: Capture and qualify leads 24/7
- Reputation Shield: Manage, improve, and protect online reviews
- Lead Capture & Qualification: Filter prospects before the sales call
- White-Label AI: Branded AI solutions for agencies
- Industry-Specific Assistants: Built for dental, legal, med spa, real estate, restaurants

${pricingBlock}

CONVERSATION STAGES:
Stage 1 (first 1–2 turns): Understand their situation before advising. Ask what type of business they run if unknown.
Stage 2 (mid-conversation): Connect their specific situation to a BotNest outcome. Be concrete.
Stage 3 (clear interest): When genuine interest is evident, offer the demo naturally.

QUALIFICATION:
High intent: specific problem + asks about pricing or getting started → be more direct.
Medium intent: curious, exploring → educate and ask one discovery question.
Low/exit intent: "just looking", "send me info" → keep alive with one question.

TOOL USAGE — MANDATORY RULES:
- search_knowledge: Call before answering any factual question about BotNest services, pricing, or policies.
- capture_lead: MUST call this tool immediately in the SAME turn the visitor provides their name AND any contact info (phone or email). Do NOT wait. Do NOT ask clarifying questions first. Call capture_lead first, then respond to them. If you detect a name + phone or email anywhere in the message, call capture_lead before doing anything else.
- get_booking_link: Call when the visitor explicitly wants to schedule or book.
- escalate_to_human: Only when explicitly requested or situation is unresolvable.

OBJECTION HANDLING:
Recognize objections from meaning and context. When you detect any:
1. Acknowledge genuinely.
2. Ask one question to surface the real concern.
3. Reframe with a specific ROI example for their industry:
${objectionROI}
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
TOOL USAGE — MANDATORY RULES:
- search_knowledge: Call before answering factual questions about this business.
- capture_lead: MUST call this tool immediately in the SAME turn the visitor provides their name AND any contact info (phone or email). Do NOT wait. Do NOT ask clarifying questions first. Call capture_lead first, then respond. If you detect a name + phone or email anywhere in the message, call capture_lead before doing anything else.
- get_booking_link: Call when they want to schedule.
- escalate_to_human: Only when situation requires a human.

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

// Allow enough iterations for: 2-3 knowledge searches + 1 action tool + 1 final text response
const MAX_TOOL_ITERATIONS = 6;

async function runAgentLoop(
  openai: OpenAI,
  systemPrompt: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  toolCtx: ToolContext,
  hasKnowledge: boolean,
): Promise<{ reply: string; toolsSideEffect?: string }> {
  let iterationMessages = [...messages];
  let lastSideEffect: string | undefined;
  const calledTools = new Set<string>(); // prevent duplicate knowledge searches

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

    // Process ALL tool calls returned in this message (OpenAI can return multiple at once)
    // Every tool_call_id in the assistant message MUST have a corresponding tool result
    const toolResultMessages: OpenAI.ChatCompletionMessageParam[] = [];

    for (const toolCall of choice.message.tool_calls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        toolArgs = {};
      }

      // Skip duplicate knowledge searches
      const toolKey = `${toolName}:${JSON.stringify(toolArgs)}`;
      if (toolName === 'search_knowledge' && calledTools.has(toolKey)) {
        toolResultMessages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: 'Already retrieved — use the knowledge already available in context.',
        });
        continue;
      }
      calledTools.add(toolKey);

      const toolResult = await executeTool(toolName, toolArgs, toolCtx);
      if (toolResult.sideEffect) lastSideEffect = toolResult.sideEffect;

      void appendMessage(toolCtx.conversationId, 'tool', toolResult.output, {
        name: toolName,
        input: toolArgs,
        output: { text: toolResult.output },
      });

      toolResultMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: toolResult.output,
      });
    }

    // Add assistant message + ALL tool results together — maintains required message structure
    iterationMessages = [
      ...iterationMessages,
      { role: 'assistant' as const, tool_calls: choice.message.tool_calls, content: null },
      ...toolResultMessages,
    ];
  }

  // Exhausted iterations — one final call using only clean user/assistant pairs (no tool messages)
  // This avoids any message format issues from accumulated tool call history
  const cleanMessages: OpenAI.ChatCompletionMessageParam[] = [];
  for (const m of iterationMessages) {
    if (m.role === 'user') {
      cleanMessages.push({ role: 'user', content: m.content as string });
    } else if (m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 0) {
      cleanMessages.push({ role: 'assistant', content: m.content });
    }
  }

  try {
    const final = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 400,
      messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages],
    });
    return {
      reply: final.choices[0].message.content ?? '',
      toolsSideEffect: lastSideEffect,
    };
  } catch (fallbackErr) {
    console.error('[chat] Fallback call failed:', fallbackErr);
    return {
      reply: lastSideEffect === 'lead_captured'
        ? "You're all set! Tap the button below to choose a time that works for you."
        : "I've noted everything — is there anything else I can help with?",
      toolsSideEffect: lastSideEffect,
    };
  }
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
      // BotNest own promotional bot — pricing already baked into system prompt.
      // Suppress ALL pricing knowledge from RAG injection to prevent knowledge
      // items (especially US-market ones) from overriding the prompt pricing rule.
      const isBotNestOwnBot = botId === '17319019-6de9-470f-ab05-fd4154fc7857'
        || botConfig?.business_name === 'BotNest AI Assistant';
      if (!isDemo) {
        try {
          let results = await searchKnowledge(botId, latestMessage, null, 4);
          if (isBotNestOwnBot) {
            // Strip all pricing items — system prompt already has market-aware pricing
            results = results.filter((r) => r.type !== 'pricing'
              && !/price|pricing|giá|bảng giá|\$\d+|\/month|\/tháng/i.test(r.title));
          } else {
            // For other bots: suppress US-market pricing if visitor writes Vietnamese
            const looksVietnamese = /[àáâãèéêìíòóôõùúýăđơư]/i.test(latestMessage)
              || market === 'vn';
            if (looksVietnamese) {
              results = results.filter(
                (r) => !/\(US\)|US market|\/month \(US|for US businesses/i.test(r.title + r.content),
              );
            }
          }
          knowledgeContext = formatKnowledgeForContext(results);
          hasKnowledge = results.length > 0;
        } catch {
          // RAG failure is non-fatal
        }
      }

      // ── Build system prompt ───────────────────────────────────────────────
      // The BotNest own promotional bot uses the demo prompt (with VN/US pricing)
      // regardless of whether it has a real DB record.
      let systemPrompt = (isDemo || isBotNestOwnBot)
        ? buildDemoPrompt(market)
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
        market: market || 'us',
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
      console.error('[chat] Unhandled error:', err);
      if (err instanceof BotNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
