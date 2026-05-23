import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Set Up Your Business' };

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // If already onboarded, go to dashboard
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12'>
      <div className='w-full max-w-xl'>
        {/* Header */}
        <div className='mb-8 text-center'>
          <div className='mb-4 flex justify-center'>
            <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10'>
              <Shield className='h-6 w-6 text-amber-400' />
            </div>
          </div>
          <h1 className='text-2xl font-semibold text-foreground'>Set up Reputation Shield</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            Tell us about your business so we can start monitoring your reputation.
          </p>
        </div>

        <OnboardingForm existingBusiness={business} />
      </div>
    </div>
  );
}
