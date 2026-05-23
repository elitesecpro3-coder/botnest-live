import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import { OnboardingForm } from '@/app/onboarding/onboarding-form';
import { getSubscription } from '@/features/account/controllers/get-subscription';
import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [businessRes, subscription] = await Promise.all([
    supabase.from('businesses').select('*').eq('user_id', user.id).maybeSingle(),
    getSubscription(),
  ]);

  const business = businessRes.data as Record<string, string | null | undefined> | null;

  const planLabel = subscription
    ? `Active — renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
    : 'No active subscription';

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>Settings</h1>
        <p className='text-sm text-muted-foreground'>Manage your business profile and billing.</p>
      </div>

      {/* Billing */}
      <section id='billing' className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-1 text-sm font-medium text-foreground'>Billing &amp; Plan</h2>
        <p className='mb-4 text-xs text-muted-foreground'>{planLabel}</p>
        <div className='flex flex-wrap gap-3'>
          {subscription ? (
            <Link
              href='/manage-subscription'
              className='inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground'
            >
              Manage subscription <ExternalLink className='h-3 w-3' />
            </Link>
          ) : (
            <Link
              href='/pricing'
              className='inline-flex items-center rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400'
            >
              Start a subscription
            </Link>
          )}
          <Link
            href='/pricing'
            className='inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground'
          >
            View plans
          </Link>
        </div>
      </section>

      {/* Account email */}
      <section className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-1 text-sm font-medium text-foreground'>Account</h2>
        <p className='text-xs text-muted-foreground'>
          Signed in as <span className='text-foreground'>{user.email}</span>
        </p>
      </section>

      {/* Business profile — reuse onboarding form */}
      <section className='space-y-3'>
        <h2 className='text-sm font-medium text-foreground'>Business Profile</h2>
        <OnboardingForm existingBusiness={business} />
      </section>
    </div>
  );
}
