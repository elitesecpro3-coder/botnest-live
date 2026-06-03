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

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

          // Auto-provision tools for this customer — non-blocking
          void provisionDefaultTools(created.id, bookingLink, notificationEmail ?? undefined);

          (async () => {
            try {
              await sendSetupEmail({
                businessName,
                botId: created.id,
                website,
                bookingLink,
                notificationEmail,
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
