import express, {
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

import { activateBot } from '../lib/supabaseClient';

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
        const botId = session.metadata?.botId;

        if (botId) {
          console.log('Activating bot:', botId);
          await activateBot(botId);
        } else {
          console.warn('Stripe checkout completed without botId metadata');
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
