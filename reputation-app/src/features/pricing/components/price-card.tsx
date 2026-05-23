'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { PriceCardVariant, productMetadataSchema } from '../models/product-metadata';
import { BillingInterval, Price, ProductWithPrices } from '../types';

export function PricingCard({
  product,
  price,
  createCheckoutAction,
}: {
  product: ProductWithPrices;
  price?: Price;
  createCheckoutAction?: ({ price }: { price: Price }) => void;
}) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    price ? (price.interval as BillingInterval) : 'month'
  );

  const currentPrice = useMemo(() => {
    if (price) return price;
    if (product.prices.length === 0) return null;
    if (product.prices.length === 1) return product.prices[0];
    return product.prices.find((p) => p.interval === billingInterval);
  }, [billingInterval, price, product.prices]);

  const monthPrice = product.prices.find((p) => p.interval === 'month')?.unit_amount;
  const metadata = productMetadataSchema.parse(product.metadata);
  const isPopular = metadata.priceCardVariant === 'growth';

  const features = buildFeatures(metadata);

  return (
    <div
      className={`relative flex w-full flex-1 flex-col rounded-xl border p-6 ${
        isPopular
          ? 'border-amber-500/50 bg-amber-500/5'
          : 'border-border bg-card'
      }`}
    >
      {isPopular && (
        <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
          <span className='rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-black'>
            Most Popular
          </span>
        </div>
      )}

      <div className='mb-4'>
        <h3 className='text-base font-semibold text-foreground'>{product.name}</h3>
        {product.description && (
          <p className='mt-1 text-xs text-muted-foreground'>{product.description}</p>
        )}
      </div>

      <div className='mb-4'>
        <span className='text-3xl font-bold text-foreground'>
          {monthPrice ? `$${monthPrice / 100}` : 'Custom'}
        </span>
        {monthPrice && <span className='ml-1 text-sm text-muted-foreground'>/mo</span>}
      </div>

      {!Boolean(price) && product.prices.length > 1 && (
        <PricingSwitch onChange={setBillingInterval} />
      )}

      <ul className='my-5 flex-1 space-y-2.5'>
        {features.map((f) => (
          <li key={f} className='flex items-start gap-2 text-sm text-muted-foreground'>
            <Check className='mt-0.5 h-4 w-4 shrink-0 text-emerald-400' />
            {f}
          </li>
        ))}
      </ul>

      {createCheckoutAction && currentPrice && (
        <Button
          variant={isPopular ? 'default' : 'outline'}
          className={`w-full ${isPopular ? 'bg-amber-500 text-black hover:bg-amber-400' : ''}`}
          onClick={() => createCheckoutAction({ price: currentPrice })}
        >
          Get Started
        </Button>
      )}
    </div>
  );
}

function buildFeatures(metadata: ReturnType<typeof productMetadataSchema.parse>): string[] {
  const f: string[] = [];
  const loc = metadata.locations === 'unlimited' ? 'Unlimited locations' : `${metadata.locations} location${metadata.locations === '1' ? '' : 's'}`;
  f.push(loc);
  f.push(`Negative review alerts (${metadata.reviewAlerts})`);
  f.push(metadata.aiDrafts ? 'AI response draft generation' : 'Manual response workflow');
  f.push(metadata.reviewRequests ? 'Review request campaigns' : 'Review monitoring only');
  f.push(`${metadata.supportLevel === 'live' ? 'Priority live chat' : 'Email'} support`);
  if (metadata.priceCardVariant === 'shield') {
    f.push('Weekly reputation report');
    f.push('Dedicated account manager');
  }
  return f;
}

function PricingSwitch({ onChange }: { onChange: (value: BillingInterval) => void }) {
  return (
    <Tabs
      defaultValue='month'
      className='mb-2 flex items-center'
      onValueChange={(v) => onChange(v as BillingInterval)}
    >
      <TabsList className='m-auto'>
        <TabsTrigger value='month'>Monthly</TabsTrigger>
        <TabsTrigger value='year'>Yearly</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export type { PriceCardVariant };
