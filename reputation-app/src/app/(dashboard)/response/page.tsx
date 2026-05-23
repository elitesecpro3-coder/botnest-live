import { redirect } from 'next/navigation';
import { Lock,Sparkles } from 'lucide-react';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'AI Response Draft' };

type Review = {
  id: string;
  author_name: string | null;
  rating: number;
  review_text: string | null;
  review_date: string | null;
  source: string;
};

const DEMO_REVIEW: Review = {
  id: '2',
  author_name: 'Tom B.',
  rating: 2,
  review_text: 'Service was slow and the staff seemed disinterested.',
  review_date: '2024-05-21',
  source: 'google',
};

const DEMO_DRAFT =
  `Hi Tom,\n\nThank you for taking the time to share your experience. We're truly sorry to hear that your visit fell short of expectations — slow service and an inattentive team is not the standard we hold ourselves to.\n\nWe'd love the opportunity to make this right. Please reach out to us directly at rick@bot-nest.com so we can learn more about what happened and ensure your next visit exceeds expectations.\n\nWarm regards,\nThe Team`;

const ratingColor = (r: number) =>
  r >= 4 ? 'text-emerald-400' : r === 3 ? 'text-amber-400' : 'text-red-400';

export default async function ResponsePage({
  searchParams,
}: {
  searchParams: Promise<{ reviewId?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { reviewId } = await searchParams;

  // Determine plan — growth+ unlocks AI drafts
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('price_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  // Any active subscription unlocks the draft UI (Growth/Shield tiers)
  // Starter plan check would compare price_id — left for Phase 3 Stripe wiring
  const hasAccess = !!sub;

  let review: Review | null = null;
  let usingDemo = true;

  const bizRes = await supabase
    .from('businesses').select('id').eq('user_id', user.id).maybeSingle();
  const business = bizRes.data as { id: string } | null;

  if (business && reviewId) {
    const { data } = await supabase
      .from('reviews')
      .select('id,author_name,rating,review_text,review_date,source')
      .eq('business_id', business.id)
      .eq('id', reviewId)
      .maybeSingle();
    if (data) {
      review = data as Review;
      usingDemo = false;
    }
  }

  const displayReview = review ?? DEMO_REVIEW;

  return (
    <div className='space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>AI Response Draft</h1>
        <p className='text-sm text-muted-foreground'>
          Generate a professional reply to a customer review in seconds.
        </p>
      </div>

      {usingDemo && (
        <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400'>
          <span className='font-medium'>Demo mode</span> — showing a sample review and draft.
        </div>
      )}

      <div className='grid gap-5 lg:grid-cols-2'>
        {/* Review card */}
        <div className='rounded-xl border border-border bg-card p-5'>
          <h2 className='mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            Original Review
          </h2>
          <div className='flex items-center gap-3'>
            <div className='flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300'>
              {(displayReview.author_name ?? '?')[0].toUpperCase()}
            </div>
            <div>
              <p className='text-sm font-medium text-foreground'>{displayReview.author_name ?? 'Anonymous'}</p>
              <p className='text-xs text-muted-foreground'>
                {displayReview.review_date
                  ? new Date(displayReview.review_date).toLocaleDateString()
                  : '—'}{' '}
                · <span className='capitalize'>{displayReview.source}</span>
              </p>
            </div>
            <span className={`ml-auto text-sm font-bold ${ratingColor(displayReview.rating)}`}>
              {'★'.repeat(displayReview.rating)}{'☆'.repeat(5 - displayReview.rating)}
            </span>
          </div>
          <p className='mt-3 text-sm text-muted-foreground'>
            {displayReview.review_text ?? 'No review text.'}
          </p>
        </div>

        {/* Draft card */}
        <div className='rounded-xl border border-border bg-card p-5'>
          <div className='mb-3 flex items-center gap-2'>
            <h2 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              AI-Generated Draft
            </h2>
            <span className='flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400'>
              <Sparkles className='h-3 w-3' /> Beta
            </span>
          </div>

          {!hasAccess ? (
            /* Locked state */
            <div className='flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-10 text-center'>
              <div className='flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800'>
                <Lock className='h-5 w-5 text-zinc-400' />
              </div>
              <div>
                <p className='text-sm font-medium text-foreground'>Available on Growth &amp; above</p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Upgrade to unlock AI-generated response drafts for every review.
                </p>
              </div>
              <a
                href='/settings#billing'
                className='mt-1 rounded-md bg-amber-500 px-4 py-1.5 text-xs font-medium text-black hover:bg-amber-400'
              >
                Upgrade Plan
              </a>
            </div>
          ) : (
            /* Draft UI */
            <div className='space-y-3'>
              <textarea
                className='h-44 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                defaultValue={usingDemo ? DEMO_DRAFT : ''}
                placeholder={usingDemo ? '' : 'Click "Generate" to create a draft…'}
                readOnly={usingDemo}
              />
              <div className='flex items-center gap-2'>
                {!usingDemo && (
                  <button
                    disabled
                    title='AI generation coming in next release'
                    className='flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black opacity-60'
                  >
                    <Sparkles className='h-3.5 w-3.5' /> Generate Draft
                  </button>
                )}
                <button
                  disabled
                  title='Copy to clipboard — coming soon'
                  className='rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60'
                >
                  Copy
                </button>
                <button
                  disabled
                  title='Mark as responded — coming soon'
                  className='rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60'
                >
                  Mark Responded
                </button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Review the draft before using it. Edit freely — it&apos;s just a starting point.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Roadmap note */}
      <div className='rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground'>
        <span className='font-medium text-foreground'>Coming soon:</span> one-click AI draft generation,
        tone selector (apologetic / professional / friendly), and direct publish to Google Business Profile.
      </div>
    </div>
  );
}
