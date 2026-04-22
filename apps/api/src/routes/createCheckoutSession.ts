import {
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

type CreateCheckoutSessionBody = {
  plan?: 'starter' | 'pro';
  botId?: string;
};

const PLAN_LOOKUP_KEYS: Record<'starter' | 'pro', string> = {
  starter: 'botnest_starter_monthly',
  pro: 'botnest_pro_monthly',
};

export function createCheckoutSessionRouter(): Router {
  const router = Router();

  router.post('/create-checkout-session', async (req: Request, res: Response) => {
    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY is required' });
      }

      const { plan, botId } = req.body as CreateCheckoutSessionBody;

      if (!botId || typeof botId !== 'string') {
        return res.status(400).json({ error: 'botId is required' });
      }

      if (!plan || (plan !== 'starter' && plan !== 'pro')) {
        return res.status(400).json({ error: 'plan must be starter or pro' });
      }

      console.log('creating checkout for botId:', botId);

      const stripe = new Stripe(stripeSecretKey);
      const lookupKey = PLAN_LOOKUP_KEYS[plan];

      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1,
      });

      const price = prices.data[0];
      if (!price) {
        return res.status(400).json({ error: `No active Stripe price found for lookup key: ${lookupKey}` });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        success_url: 'https://botnest-website.vercel.app/success.html?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://botnest-website.vercel.app/cancel.html',
        metadata: {
          botId,
          plan,
        },
      });

      return res.json({ url: session.url });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to create checkout session';
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
