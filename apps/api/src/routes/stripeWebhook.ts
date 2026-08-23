import express, {
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

import { createClient } from '@supabase/supabase-js';
import {
  activateBot,
  createBotConfig,
  deactivateBot,
  getBotByStripeSubscriptionId,
  updateBotStripeIds,
} from '../lib/supabaseClient';
import { sendSetupEmail } from '../lib/email';
import { createKnowledgeItem } from '../lib/knowledgeSearch';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  _supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _supabase;
}
const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop) { return (getSupabase() as any)[prop]; },
});

type KnowledgeSeed = { type: string; title: string; content: string };

function buildStarterKnowledge(
  businessName: string,
  industry: string,
  description: string,
  bookingLink: string | undefined,
  market: string,
): KnowledgeSeed[] {
  const isVN = market === 'vn';
  const hasBooking = Boolean(bookingLink);

  // Normalise industry to a category
  const ind = industry.toLowerCase();
  const isDental = /dent|nha\s*khoa|oral/.test(ind);
  const isLegal = /law|legal|luat|attorney|solicitor/.test(ind);
  const isSpa = /spa|med\s*spa|medspa|aesthetic|beauty|tham\s*my|lam\s*dep/.test(ind);
  const isRealEstate = /real\s*estate|bat\s*dong\s*san|property|realt/.test(ind);
  const isRestaurant = /restaurant|nha\s*hang|cafe|food|diner/.test(ind);

  const items: KnowledgeSeed[] = [];

  if (isVN) {
    items.push({
      type: 'info',
      title: `Giới Thiệu — ${businessName}`,
      content: description
        ? `${businessName} là ${industry}. ${description}`
        : `${businessName} là ${industry}. Trợ lý AI này giúp khách hàng tìm hiểu dịch vụ, đặt lịch và để lại thông tin liên hệ.`,
    });
    items.push({
      type: 'faq',
      title: 'Cách liên hệ hoặc đặt lịch',
      content: hasBooking
        ? `Để đặt lịch hẹn với ${businessName}, nhấn nút "Đặt Lịch" bên dưới. Link đặt lịch trực tuyến: ${bookingLink}`
        : `Để liên hệ với ${businessName}, vui lòng để lại tên và số điện thoại — đội ngũ sẽ liên hệ lại trong thời gian sớm nhất.`,
    });
    if (isDental) {
      items.push({
        type: 'service',
        title: 'Dịch Vụ Nha Khoa',
        content: `${businessName} cung cấp các dịch vụ nha khoa chuyên nghiệp. Chatbot có thể giải đáp thắc mắc về dịch vụ, giá cả và hỗ trợ đặt lịch khám. Để biết thêm về các gói điều trị hoặc đặt lịch, vui lòng để lại thông tin hoặc nhấn nút Đặt Lịch.`,
      });
    } else if (isLegal) {
      items.push({
        type: 'service',
        title: 'Dịch Vụ Pháp Lý',
        content: `${businessName} cung cấp tư vấn và hỗ trợ pháp lý. Chatbot giúp thu thập thông tin ban đầu (loại vụ kiện, thời hạn, mô tả tình huống) trước khi kết nối bạn với luật sư. Để đặt lịch tư vấn, nhấn nút Đặt Lịch hoặc để lại số điện thoại.`,
      });
    } else if (isSpa) {
      items.push({
        type: 'service',
        title: 'Dịch Vụ Spa & Thẩm Mỹ',
        content: `${businessName} cung cấp các dịch vụ spa và làm đẹp chuyên nghiệp. Chatbot hỗ trợ khách tìm hiểu dịch vụ, giá và đặt lịch hẹn 24/7. Để đặt lịch, nhấn nút Đặt Lịch bên dưới hoặc để lại số điện thoại.`,
      });
    } else {
      items.push({
        type: 'service',
        title: `Dịch Vụ — ${businessName}`,
        content: `${businessName} cung cấp dịch vụ trong lĩnh vực ${industry}. ${description || 'Chatbot này giúp khách tìm hiểu dịch vụ và đặt lịch hẹn.'}`,
      });
    }
    items.push({
      type: 'faq',
      title: 'Giờ hoạt động và hỗ trợ',
      content: `Chatbot AI của ${businessName} hoạt động 24/7 để trả lời câu hỏi và thu thập thông tin liên hệ. Đội ngũ ${businessName} sẽ phản hồi trong giờ làm việc.`,
    });
  } else {
    items.push({
      type: 'info',
      title: `About ${businessName}`,
      content: description
        ? `${businessName} is a ${industry} business. ${description}`
        : `${businessName} is a ${industry} business. This AI assistant helps customers learn about services, book appointments, and get in touch.`,
    });
    items.push({
      type: 'faq',
      title: 'How to contact or book an appointment',
      content: hasBooking
        ? `To book an appointment with ${businessName}, click the Book Now button below. Online booking link: ${bookingLink}`
        : `To reach ${businessName}, leave your name and phone number and the team will get back to you as soon as possible.`,
    });
    if (isDental) {
      items.push({
        type: 'service',
        title: 'Dental Services',
        content: `${businessName} provides professional dental care. The AI assistant can answer questions about services, pricing, and help schedule appointments. To learn about treatment options or book, click Book Now or leave your contact information.`,
      });
    } else if (isLegal) {
      items.push({
        type: 'service',
        title: 'Legal Services',
        content: `${businessName} provides legal consultation and representation. The chatbot collects initial intake information (case type, timeline, description) before connecting you with an attorney. To schedule a consultation, click Book Now or leave your phone number.`,
      });
    } else if (isSpa) {
      items.push({
        type: 'service',
        title: 'Med Spa & Aesthetic Services',
        content: `${businessName} provides professional spa and aesthetic services. The AI assistant helps clients learn about treatments, pricing, and book appointments 24/7. Click Book Now below or leave your contact information.`,
      });
    } else if (isRealEstate) {
      items.push({
        type: 'service',
        title: 'Real Estate Services',
        content: `${businessName} provides real estate services. The AI assistant helps qualify buyers and sellers, answer questions about listings, and schedule viewings. Leave your contact information or click Book Now to connect.`,
      });
    } else if (isRestaurant) {
      items.push({
        type: 'service',
        title: 'Restaurant Information',
        content: `${businessName} is a restaurant. The AI assistant can answer questions about the menu, hours, reservations, and private events. To make a reservation, click Book Now or leave your contact details.`,
      });
    } else {
      items.push({
        type: 'service',
        title: `Services — ${businessName}`,
        content: `${businessName} offers ${industry} services. ${description || 'This AI assistant helps visitors learn about services and get in touch with the team.'}`,
      });
    }
    items.push({
      type: 'faq',
      title: 'Hours and support',
      content: `The ${businessName} AI assistant is available 24/7 to answer questions and capture contact information. The ${businessName} team will follow up during business hours.`,
    });
  }

  return items;
}

// Auto-provision knowledge for a newly created bot — non-blocking
async function provisionDefaultKnowledge(
  botId: string,
  businessName: string,
  industry: string,
  description: string,
  bookingLink: string | undefined,
  market: string,
): Promise<void> {
  try {
    const items = buildStarterKnowledge(businessName, industry, description, bookingLink, market);
    for (const item of items) {
      try {
        await createKnowledgeItem(botId, item.type, item.title, item.content);
      } catch (err) {
        console.error('[webhook] Knowledge item creation failed (non-fatal):', item.title, err);
      }
    }
    console.log(`[webhook] Provisioned ${items.length} knowledge items for bot:`, botId);
  } catch (err) {
    console.error('[webhook] Knowledge provisioning failed (non-fatal):', err);
  }
}

// Auto-provision tools for a newly created bot — every customer gets these by default
async function provisionDefaultTools(botId: string, bookingLink?: string, notificationEmail?: string): Promise<void> {
  try {
    await supabase.from('tools').insert([
      {
        bot_id: botId,
        type: 'lead_capture',
        name: 'Lead Capture',
        config: { require_email: false, notify_email: notificationEmail ?? null },
        is_enabled: true,
      },
      {
        bot_id: botId,
        type: 'booking',
        name: 'Appointment Booking',
        config: { provider: 'calendly', url: bookingLink ?? '' },
        is_enabled: Boolean(bookingLink),
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
        config: { email: notificationEmail ?? null },
        is_enabled: true,
      },
    ]);
    console.log('[webhook] Provisioned default tools for bot:', botId);
  } catch (err) {
    console.error('[webhook] Tool provisioning failed (non-fatal):', err);
  }
}

const TEMP_USER_ID = 'c5ea980f-669b-4ff7-968e-627115f47ed1';

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createStripeWebhookRouter(): Router {
  const router = Router();

  router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY is required' });
      }

      if (!stripeWebhookSecret) {
        return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is required' });
      }

      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return res.status(400).send('Missing Stripe signature');
      }

      const stripe = new Stripe(stripeSecretKey);
      const event = stripe.webhooks.constructEvent(req.body as Buffer, signature, stripeWebhookSecret);

      console.log('Webhook received:', event.type);

      // ─── Subscription activated / payment succeeded ──────────────────────
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const botId = asTrimmedString(session.metadata?.botId);
        const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;

        if (botId) {
          console.log('[webhook] Activating existing bot:', botId);
          await activateBot(botId);
          if (stripeSubscriptionId && stripeCustomerId) {
            await updateBotStripeIds(botId, stripeSubscriptionId, stripeCustomerId);
          }
        } else {
          const businessName = asTrimmedString(session.metadata?.business_name);
          const website = asTrimmedString(session.metadata?.website);
          const bookingLink = asTrimmedString(session.metadata?.booking_link);
          const plan = asTrimmedString(session.metadata?.plan);
          const market = asTrimmedString(session.metadata?.market) ?? 'us';
          const industry = asTrimmedString(session.metadata?.industry) ?? 'General';
          const description = asTrimmedString(session.metadata?.description) ?? '';
          const tone = asTrimmedString(session.metadata?.tone) ?? 'professional';
          const notificationEmail = asTrimmedString(session.metadata?.notification_email) ?? null;

          if (!businessName || !website || !plan) {
            console.warn('[webhook] checkout.session.completed: metadata missing required fields');
            return res.status(200).send('Webhook received');
          }

          const created = await createBotConfig({
            user_id: TEMP_USER_ID,
            business_name: businessName,
            website,
            booking_link: bookingLink,
            industry,
            description,
            tone,
            notification_email: notificationEmail,
            market,
            usage_count: 0,
            usage_limit: market === 'vn' ? 500 : 500,
            welcome_message: null,
            system_prompt: null,
            fallback_contact: null,
            lead_capture_enabled: true,
            is_active: true,
          });

          console.log('[webhook] Created and activating bot:', created.id);
          await activateBot(created.id);

          if (stripeSubscriptionId && stripeCustomerId) {
            await updateBotStripeIds(created.id, stripeSubscriptionId, stripeCustomerId);
          }

          // Auto-provision tools and starter knowledge — non-blocking
          void provisionDefaultTools(created.id, bookingLink, notificationEmail ?? undefined);
          void provisionDefaultKnowledge(created.id, businessName, industry, description, bookingLink, market);

          (async () => {
            try {
              await sendSetupEmail({
                businessName,
                botId: created.id,
                website,
                bookingLink,
                notificationEmail,
                market,
              });
            } catch (err) {
              console.error('🔥 [ALERT] Setup email failed:', err);
            }
          })();
        }
      }

      // ─── Subscription canceled (client canceled or Stripe gave up retrying) ─
      else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] Subscription canceled:', subscription.id);

        const bot = await getBotByStripeSubscriptionId(subscription.id);
        if (bot) {
          console.log('[webhook] Deactivating bot:', bot.id, 'reason: canceled');
          await deactivateBot(bot.id, 'canceled');
        } else {
          console.warn('[webhook] customer.subscription.deleted: no bot found for subscription', subscription.id);
        }
      }

      // ─── Invoice payment failed — flag as past_due, Stripe will retry ────
      else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        console.log('[webhook] Payment failed for subscription:', subscriptionId);

        if (subscriptionId) {
          const bot = await getBotByStripeSubscriptionId(subscriptionId);
          if (bot) {
            console.log('[webhook] Marking bot past_due:', bot.id);
            await deactivateBot(bot.id, 'past_due');
          }
        }
      }

      // ─── Invoice payment succeeded — reactivate if previously suspended ──
      else if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;

        if (subscriptionId) {
          const bot = await getBotByStripeSubscriptionId(subscriptionId);
          if (bot && bot.status === 'past_due') {
            console.log('[webhook] Reactivating bot after payment recovered:', bot.id);
            await activateBot(bot.id);
          }
        }
      }

      // ─── Subscription updated (plan change, pause, resume, etc.) ─────────
      else if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] Subscription updated:', subscription.id, 'status:', subscription.status);

        const bot = await getBotByStripeSubscriptionId(subscription.id);
        if (bot) {
          if (subscription.status === 'active') {
            await activateBot(bot.id);
          } else if (subscription.status === 'past_due') {
            await deactivateBot(bot.id, 'past_due');
          } else if (subscription.status === 'canceled') {
            await deactivateBot(bot.id, 'canceled');
          }
        }
      }

      else {
        console.log('[webhook] Unhandled event type:', event.type);
      }

      return res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Stripe webhook error:', error);
      return res.status(400).send('Webhook Error');
    }
  });

  return router;
}
