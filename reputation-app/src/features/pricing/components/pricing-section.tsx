import { PricingCard } from '@/features/pricing/components/price-card';
import { getProducts } from '@/features/pricing/controllers/get-products';

import { createCheckoutAction } from '../actions/create-checkout-action';

export async function PricingSection({ isPricingPage }: { isPricingPage?: boolean }) {
  const products = await getProducts();
  const HeadingLevel = isPricingPage ? 'h1' : 'h2';

  return (
    <section className='py-12'>
      <div className='mx-auto flex max-w-5xl flex-col items-center gap-8 px-4'>
        <div className='text-center'>
          <HeadingLevel className='text-3xl font-bold text-foreground lg:text-4xl'>
            Simple, transparent pricing
          </HeadingLevel>
          <p className='mt-3 text-sm text-muted-foreground'>
            Start protecting your reputation today. Cancel anytime.
          </p>
        </div>

        <div className='flex w-full flex-col items-stretch gap-6 lg:flex-row'>
          {products.map((product) => (
            <PricingCard
              key={product.id}
              product={product}
              createCheckoutAction={createCheckoutAction}
            />
          ))}
        </div>

        <p className='text-center text-xs text-muted-foreground'>
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </div>
    </section>
  );
}
