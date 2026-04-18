import {
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';

import {
  createBotConfig,
  DuplicateBotIdError,
} from '../lib/supabaseClient';

type CreateBotBody = {
  id?: string;
  business_name?: string;
  website?: string;
  industry?: string;
  description?: string;
  booking_link?: string;
  tone?: string;
  selected_plan?: string;
};

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildWelcomeMessage(businessName: string): string {
  return `Welcome to ${businessName}! I can answer questions and help you book quickly. What can I help with today?`;
}

function buildSystemPrompt(input: {
  businessName: string;
  website?: string;
  industry?: string;
  description?: string;
  bookingLink?: string;
  tone?: string;
  selectedPlan?: string;
}): string {
  const tone = input.tone || 'friendly, clear, and concise';
  const lines: string[] = [
    `You are the AI assistant for ${input.businessName}.`,
    'Help website visitors understand the business, services, pricing expectations, and next steps.',
    `Use a ${tone} tone. Keep replies concise, helpful, and conversion-focused.`,
    'Do not invent facts. If details are missing, say so clearly and offer a helpful next action.',
    'Capture leads naturally when intent is high by asking for name, email, and phone in a polite sequence.',
  ];

  if (input.industry) {
    lines.push(`Industry: ${input.industry}.`);
  }

  if (input.description) {
    lines.push(`Business description: ${input.description}.`);
  }

  if (input.website) {
    lines.push(`Website: ${input.website}.`);
  }

  if (input.selectedPlan) {
    lines.push(`BotNest plan context: ${input.selectedPlan}.`);
  }

  if (input.bookingLink) {
    lines.push(
      `If a visitor asks to schedule or is ready to move forward, encourage booking and share this link: ${input.bookingLink}.`,
    );
  } else {
    lines.push('If a visitor asks to schedule, offer to collect their contact details for follow-up.');
  }

  lines.push('Always end with a clear next step question when appropriate.');

  return lines.join('\n');
}

function buildEmbedCode(req: Request, botId: string): string {
  const widgetScriptUrl = process.env.WIDGET_SCRIPT_URL || 'https://widget.botnest.ai/widget.js';
  const defaultApiUrl = `${req.protocol}://${req.get('host')}`;
  const apiUrl = process.env.PUBLIC_API_BASE_URL || defaultApiUrl;

  return `<script src="${widgetScriptUrl}" data-bot-id="${botId}" data-api-url="${apiUrl}"></script>`;
}

export function createCreateBotRouter(): Router {
  const router = Router();

  router.post('/create-bot', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateBotBody;

      const id = asTrimmedString(body.id);
      const businessName = asTrimmedString(body.business_name);

      if (!id || !businessName) {
        return res.status(400).json({ error: 'id and business_name are required' });
      }

      const website = asTrimmedString(body.website);
      const industry = asTrimmedString(body.industry);
      const description = asTrimmedString(body.description);
      const bookingLink = asTrimmedString(body.booking_link);
      const tone = asTrimmedString(body.tone);
      const selectedPlan = asTrimmedString(body.selected_plan);

      const welcomeMessage = buildWelcomeMessage(businessName);
      const systemPrompt = buildSystemPrompt({
        businessName,
        website,
        industry,
        description,
        bookingLink,
        tone,
        selectedPlan,
      });

      const created = await createBotConfig({
        id,
        business_name: businessName,
        booking_link: bookingLink || null,
        welcome_message: welcomeMessage,
        system_prompt: systemPrompt,
        fallback_contact: null,
        lead_capture_enabled: true,
      });

      return res.status(201).json({
        success: true,
        botId: created.id,
        embedCode: buildEmbedCode(req, created.id),
      });
    } catch (err) {
      if (err instanceof DuplicateBotIdError) {
        // Returning 409 keeps bot ids stable and avoids silently creating unexpected embed ids.
        return res.status(409).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
