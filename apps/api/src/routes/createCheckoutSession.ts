import {
  Request,
  Response,
  Router,
} from 'express';
import Stripe from 'stripe';

type CreateCheckoutSessionBody = {
  plan?: 'starter' | 'pro';
  selected_plan?: 'starter' | 'pro';
  botId?: string;
  business_name?: string;
  website?: string;
  booking_link?: string;
};

const PLAN_LOOKUP_KEYS: Record<'starter' | 'pro', string> = {
  starter: 'botnest_starter_monthly',
  pro: 'botnest_pro_monthly',
};

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createCheckoutSessionRouter(): Router {
  const router = Router();

  router.post('/create-checkout-session', async (req: Request, res: Response) => {
    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY is required' });
      }

      const {
        plan,
        selected_plan,
        botId,
        business_name,
        website,
        booking_link,
      } = req.body as CreateCheckoutSessionBody;

      const normalizedBotId = asTrimmedString(botId);
      const normalizedBusinessName = asTrimmedString(business_name);
      const normalizedWebsite = asTrimmedString(website);
      const normalizedBookingLink = asTrimmedString(booking_link);
      const resolvedPlan = selected_plan ?? plan;
      if (!resolvedPlan || (resolvedPlan !== 'starter' && resolvedPlan !== 'pro')) {
        return res.status(400).json({ error: 'plan must be starter or pro' });
      }

      if (!normalizedBotId && (!normalizedBusinessName || !normalizedWebsite)) {
        return res.status(400).json({
          error: 'business_name and website are required when botId is not provided',
        });
      }

      console.log('creating checkout for botId:', normalizedBotId || 'pending');

      const stripe = new Stripe(stripeSecretKey);
      const lookupKey = PLAN_LOOKUP_KEYS[resolvedPlan];

      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1,
      });

      const price = prices.data[0];
      if (!price) {
        return res.status(400).json({ error: `No active Stripe price found for lookup key: ${lookupKey}` });
      }

      const metadata: Record<string, string> = {
        plan: resolvedPlan,
      };

      if (normalizedBotId) {
        metadata.botId = normalizedBotId;
      }
      if (normalizedBusinessName) {
        metadata.business_name = normalizedBusinessName;
      }
      if (normalizedWebsite) {
        metadata.website = normalizedWebsite;
      }
      if (normalizedBookingLink) {
        metadata.booking_link = normalizedBookingLink;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        success_url: 'https://bot-nest.com/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://bot-nest.com/cancel',
        metadata,
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
