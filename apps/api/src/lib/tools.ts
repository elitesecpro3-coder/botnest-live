import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { searchKnowledge, formatKnowledgeForContext } from './knowledgeSearch';
import { logToolCall, markLeadCaptured } from './memory';
import { sendLeadNotification } from './email';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ─── Tool Definitions (OpenAI function-calling format) ─────────────────────

export const TOOL_DEFINITIONS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description:
        'Search the business knowledge base for information about services, pricing, FAQs, policies, or promotions. Call this before answering any factual question about the business.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'The search query based on what the visitor is asking about',
          },
          type: {
            type: 'string',
            enum: ['faq', 'service', 'pricing', 'policy', 'promotion', 'info', 'all'],
            description: 'Filter by knowledge type. Use "all" when unsure.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description:
        'Save visitor contact information to the database and send a notification. MUST be called immediately — in the same turn — the moment the visitor has provided their name AND at least one of: phone number or email address. Do not wait for the next turn. Do not ask for more information before calling this. Call this even if the visitor is mid-conversation.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Full name of the visitor' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email address' },
          industry: { type: 'string', description: 'Type of business the visitor runs' },
          pain_points: {
            type: 'array',
            items: { type: 'string' },
            description: 'Problems or needs mentioned by the visitor',
          },
          intent_score: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: '1-10 score of how ready the visitor is to buy or book',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_booking_link',
      description:
        'Get the appointment booking link when a visitor wants to schedule a call, demo, or appointment.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description:
        'Escalate to a human when: the visitor has a complex complaint, the AI cannot resolve the situation, or the visitor explicitly requests a human. Do not use this prematurely.',
      parameters: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: {
            type: 'string',
            description: 'Why this conversation needs a human',
          },
        },
      },
    },
  },
];

// ─── Tool Context ────────────────────────────────────────────────────────────

export type ToolContext = {
  botId: string;
  conversationId: string;
  bookingLink?: string;
  notificationEmail?: string;
  businessName?: string;
  market?: string;
};

// ─── Tool Executor ────────────────────────────────────────────────────────────

export type ToolResult = {
  output: string;
  sideEffect?: 'lead_captured' | 'escalated' | 'booking_opened';
};

export async function executeTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const start = Date.now();

  try {
    let result: ToolResult;

    switch (toolName) {
      case 'search_knowledge':
        result = await executeSearchKnowledge(toolArgs, ctx);
        break;

      case 'capture_lead':
        result = await executeCaptureL(toolArgs, ctx);
        break;

      case 'get_booking_link':
        result = executeGetBookingLink(ctx);
        break;

      case 'escalate_to_human':
        result = await executeEscalate(toolArgs, ctx);
        break;

      default:
        result = { output: `Unknown tool: ${toolName}` };
    }

    void logToolCall(
      ctx.conversationId,
      toolName,
      toolArgs,
      { output: result.output },
      'success',
      undefined,
      Date.now() - start,
    );

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    void logToolCall(
      ctx.conversationId,
      toolName,
      toolArgs,
      null,
      'error',
      errorMsg,
      Date.now() - start,
    );
    return { output: `Tool ${toolName} failed: ${errorMsg}` };
  }
}

// ─── Individual tool implementations ─────────────────────────────────────────

async function executeSearchKnowledge(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const query = String(args.query ?? '');
  const type = typeof args.type === 'string' && args.type !== 'all' ? args.type : null;

  const results = await searchKnowledge(ctx.botId, query, type, 5);
  const formatted = formatKnowledgeForContext(results);

  return {
    output: formatted || 'No relevant knowledge found for this query.',
  };
}

async function executeCaptureL(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const name = String(args.name ?? '').trim();
  const phone = typeof args.phone === 'string' ? args.phone.trim() : null;
  const email = typeof args.email === 'string' ? args.email.trim() : null;
  const industry = typeof args.industry === 'string' ? args.industry : null;
  const painPoints = Array.isArray(args.pain_points)
    ? (args.pain_points as string[])
    : [];
  const intentScore = typeof args.intent_score === 'number' ? args.intent_score : null;

  if (!name || (!phone && !email)) {
    return { output: 'Lead not saved: name and at least one contact method required.' };
  }

  const { error } = await supabase.from('leads').insert({
    bot_id: ctx.botId,
    conversation_id: ctx.conversationId,
    name,
    phone: phone || null,
    email: email || null,
    industry,
    pain_points: painPoints.length > 0 ? painPoints : null,
    intent_score: intentScore,
    source: 'widget',
    status: 'new',
  });

  if (error) {
    return { output: `Lead save failed: ${error.message}` };
  }

  await markLeadCaptured(ctx.conversationId);

  // Fire-and-forget notification
  void sendLeadNotification({
    botId: ctx.botId,
    name,
    phone: phone ?? 'Not provided',
    email: email ?? null,
    notificationEmail: ctx.notificationEmail ?? null,
    businessName: ctx.businessName ?? 'BotNest',
    market: ctx.market ?? 'us',
  });

  return {
    output: 'Lead captured successfully.',
    sideEffect: 'lead_captured',
  };
}

function executeGetBookingLink(ctx: ToolContext): ToolResult {
  const link = ctx.bookingLink || 'https://calendly.com/rick-bot-nest/30min';
  return {
    output: `Booking link: ${link}. Tell the visitor to click the Book Now button below to schedule their appointment.`,
    sideEffect: 'booking_opened',
  };
}

async function executeEscalate(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const reason = String(args.reason ?? 'Visitor requested human assistance');

  // Get conversation transcript for context
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', ctx.conversationId)
    .order('created_at', { ascending: true })
    .limit(50);

  const transcript = (messages ?? [])
    .filter((m) => m.role !== 'system')
    .map((m) => `[${m.role.toUpperCase()}] ${m.content}`)
    .join('\n');

  await supabase.from('escalations').insert({
    conversation_id: ctx.conversationId,
    reason,
    transcript,
    status: 'pending',
  });

  await supabase
    .from('conversations')
    .update({ status: 'escalated', updated_at: new Date().toISOString() })
    .eq('id', ctx.conversationId);

  return {
    output: 'Escalation created. A team member has been notified and will follow up shortly.',
    sideEffect: 'escalated',
  };
}
