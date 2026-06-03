import { NextFunction, Request, Response, Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { createBotConfig } from '../lib/supabaseClient';
import { createKnowledgeItem } from '../lib/knowledgeSearch';
import { sendSetupEmail } from '../lib/email';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const DEFAULT_USER_ID = 'c5ea980f-669b-4ff7-968e-627115f47ed1';

type OnboardPayload = {
  businessName: string;
  website?: string;
  industry?: string;
  description?: string;
  bookingLink?: string;
  notificationEmail?: string;
  market?: 'us' | 'vn';
  plan?: 'starter' | 'pro';
  knowledge?: Array<{
    type: string;
    title: string;
    content: string;
  }>;
  tools?: {
    leadCapture?: boolean;
    booking?: boolean;
    escalation?: boolean;
    escalationEmail?: string;
  };
};

// POST /api/onboard — create a fully configured bot in one call
// Goal: under 15 minutes from signup to deployment
export function createOnboardRouter(): Router {
  const router = Router();

  router.post('/onboard', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as OnboardPayload;

      if (!payload.businessName?.trim()) {
        return res.status(400).json({ error: 'businessName is required' });
      }

      const botId = uuidv4();

      // 1. Create bot record
      await createBotConfig({
        id: botId,
        user_id: DEFAULT_USER_ID,
        business_name: payload.businessName.trim(),
        website: payload.website || null,
        industry: payload.industry,
        description: payload.description,
        booking_link: payload.bookingLink || null,
        notification_email: payload.notificationEmail || null,
        market: payload.market || 'us',
        plan: payload.plan || 'starter',
        usage_count: 0,
        usage_limit: 500,
        lead_capture_enabled: true,
        is_active: true,
      });

      // 2. Seed default tools
      const toolsToCreate = [
        {
          bot_id: botId,
          type: 'lead_capture',
          name: 'Lead Capture',
          config: {
            require_email: false,
            notify_email: payload.notificationEmail || null,
          },
          is_enabled: payload.tools?.leadCapture !== false,
        },
        {
          bot_id: botId,
          type: 'booking',
          name: 'Appointment Booking',
          config: {
            provider: 'calendly',
            url: payload.bookingLink || '',
          },
          is_enabled: payload.tools?.booking !== false && Boolean(payload.bookingLink),
        },
        {
          bot_id: botId,
          type: 'knowledge_search',
          name: 'Knowledge Search',
          config: { similarity_threshold: 0.65, max_results: 5 },
          is_enabled: true,
        },
        {
          bot_id: botId,
          type: 'escalate',
          name: 'Human Escalation',
          config: {
            email: payload.tools?.escalationEmail || payload.notificationEmail || null,
          },
          is_enabled: payload.tools?.escalation === true,
        },
      ];

      await supabase.from('tools').insert(toolsToCreate);

      // 3. Upload initial knowledge items (fire-and-forget embedding)
      const knowledgeIds: string[] = [];
      if (Array.isArray(payload.knowledge) && payload.knowledge.length > 0) {
        for (const item of payload.knowledge.slice(0, 50)) {
          if (!item.title?.trim() || !item.content?.trim()) continue;
          try {
            const id = await createKnowledgeItem(botId, item.type || 'info', item.title.trim(), item.content.trim());
            knowledgeIds.push(id);
          } catch {
            // Non-fatal: knowledge item creation failure doesn't block onboarding
          }
        }
      }

      // 4. Send setup email (non-blocking)
      if (payload.notificationEmail) {
        void sendSetupEmail({
          businessName: payload.businessName.trim(),
          botId,
          website: payload.website || 'your website',
          bookingLink: payload.bookingLink || null,
          notificationEmail: payload.notificationEmail,
        });
      }

      // 5. Build embed script
      const apiUrl = 'https://botnest-live-production.up.railway.app';
      const embedScript = `<script src="${apiUrl}/widget.js"\n  data-bot-id="${botId}"\n  data-api-url="${apiUrl}">\n</script>`;

      return res.status(201).json({
        botId,
        embedScript,
        knowledgeItems: knowledgeIds.length,
        message: `${payload.businessName} is ready. Paste the embed script before </body> on your website.`,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
