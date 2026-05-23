'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveBusiness, SaveBusinessState } from '@/features/onboarding/actions/save-business';

const INDUSTRIES = [
  'Dental Practice', 'Medical / Healthcare', 'Law Firm', 'Med Spa / Aesthetics',
  'Real Estate', 'Restaurant / Food & Beverage', 'Chiropractic', 'Auto Repair',
  'Home Services', 'Salon / Beauty', 'Fitness / Gym', 'Retail', 'Other',
];

interface Props {
  existingBusiness: Record<string, string | null | undefined> | null;
}

function Field({ label, name, type = 'text', placeholder, error, defaultValue }: {
  label: string; name: string; type?: string; placeholder?: string;
  error?: string; defaultValue?: string | null;
}) {
  return (
    <div>
      <label className='mb-1 block text-xs font-medium text-muted-foreground' htmlFor={name}>
        {label}
      </label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        className={error ? 'border-red-500 focus-visible:ring-red-500/30' : ''}
      />
      {error && <p className='mt-1 text-xs text-red-400'>{error}</p>}
    </div>
  );
}

export function OnboardingForm({ existingBusiness }: Props) {
  const [state, action, isPending] = useActionState<SaveBusinessState, FormData>(
    saveBusiness,
    {}
  );
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className='space-y-6'>
      {state.error && (
        <div className='rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400'>
          {state.error}
        </div>
      )}

      {/* Business basics */}
      <section className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-4 text-sm font-medium text-foreground'>Business Information</h2>
        <div className='space-y-3'>
          <Field label='Business Name *' name='name' placeholder='Bright Smile Dental'
            error={e.name} defaultValue={existingBusiness?.name} />
          <Field label='Website' name='website' type='url' placeholder='https://yourbusiness.com'
            error={e.website} defaultValue={existingBusiness?.website} />

          <div>
            <label className='mb-1 block text-xs font-medium text-muted-foreground'>Industry</label>
            <select
              name='industry'
              defaultValue={existingBusiness?.industry ?? ''}
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            >
              <option value=''>Select industry…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Google profile */}
      <section className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-1 text-sm font-medium text-foreground'>Google Business Profile</h2>
        <p className='mb-4 text-xs text-muted-foreground'>
          Paste the link to your Google Business Profile so we can monitor your reviews.
        </p>
        <Field label='Google Business Profile URL' name='google_profile_url' type='url'
          placeholder='https://maps.google.com/maps?cid=...'
          error={e.google_profile_url} defaultValue={existingBusiness?.google_profile_url} />
      </section>

      {/* Contact */}
      <section className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-4 text-sm font-medium text-foreground'>Contact Details</h2>
        <div className='space-y-3'>
          <Field label='Notification Email' name='contact_email' type='email'
            placeholder='owner@yourbusiness.com' error={e.contact_email}
            defaultValue={existingBusiness?.contact_email} />
          <Field label='Phone' name='contact_phone' type='tel' placeholder='+1 (555) 000-0000'
            error={e.contact_phone} defaultValue={existingBusiness?.contact_phone} />
        </div>
      </section>

      {/* Location */}
      <section className='rounded-xl border border-border bg-card p-5'>
        <h2 className='mb-4 text-sm font-medium text-foreground'>Primary Location</h2>
        <div className='space-y-3'>
          <Field label='Street Address' name='address' placeholder='123 Main St'
            defaultValue={existingBusiness?.address} />
          <div className='grid grid-cols-3 gap-3'>
            <Field label='City' name='city' placeholder='Austin' defaultValue={existingBusiness?.city} />
            <Field label='State' name='state' placeholder='TX' defaultValue={existingBusiness?.state} />
            <Field label='ZIP' name='zip' placeholder='78701' defaultValue={existingBusiness?.zip} />
          </div>
        </div>
      </section>

      <Button type='submit' className='w-full' disabled={isPending}>
        {isPending ? (
          <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Saving…</>
        ) : (
          'Complete Setup & Go to Dashboard →'
        )}
      </Button>
    </form>
  );
}
