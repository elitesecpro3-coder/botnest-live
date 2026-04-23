import express, {
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

import {
  activateBot,
  createBotConfig,
} from '../lib/supabaseClient';

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

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const botId = asTrimmedString(session.metadata?.botId);

        if (botId) {
          console.log('Stripe payment success for bot:', botId);
          console.log('Activating bot:', botId);
          await activateBot(botId);
        } else {
          const businessName = asTrimmedString(session.metadata?.business_name);
          const website = asTrimmedString(session.metadata?.website);
          const bookingLink = asTrimmedString(session.metadata?.booking_link);
          const plan = asTrimmedString(session.metadata?.plan);

          if (!businessName || !website || !plan) {
            console.warn('Stripe checkout metadata missing required fields for bot creation');
            return res.status(200).send('Webhook received');
          }

          const created = await createBotConfig({
            user_id: TEMP_USER_ID,
            business_name: businessName,
            website,
            booking_link: bookingLink,
            tone: 'professional',
            usage_count: 0,
            usage_limit: 500,
            welcome_message: null,
            system_prompt: null,
            fallback_contact: null,
            lead_capture_enabled: true,
          });

          console.log('Stripe payment success for bot:', created.id);
          console.log('Activating bot:', created.id);
          await activateBot(created.id);
        }
      }

      return res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Stripe webhook error:', error);
      return res.status(400).send('Webhook Error');
    }
  });

  return router;
}
