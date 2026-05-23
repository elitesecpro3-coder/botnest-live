import Stripe from 'stripe';

import { getEnvVar } from '@/utils/get-env-var';

let _stripeAdmin: Stripe | undefined;

export function getStripeAdmin(): Stripe {
  if (!_stripeAdmin) {
    _stripeAdmin = new Stripe(
      getEnvVar(process.env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY'),
      {
        apiVersion: '2023-10-16',
        appInfo: {
          name: 'BotNest Reputation Shield',
          version: '0.1.0',
        },
      }
    );
  }
  return _stripeAdmin;
}
