import { redirect } from 'next/navigation';
import { Filter,Star } from 'lucide-react';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Reviews' };

type Review = {
  id: string;
  author_name: string | null;
  rating: number;
  review_text: string | null;
  review_date: string | null;
  source: string;
  response_status: string;
  sentiment: string | null;
  is_flagged: boolean;
};

const DEMO_REVIEWS: Review[] = [
  { id: '1', author_name: 'Maria G.',    rating: 5, review_text: 'Absolutely love this place. Will definitely be back!',             review_date: '2024-05-21', source: 'google', response_status: 'pending',   sentiment: 'positive', is_flagged: false },
  { id: '2', author_name: 'Tom B.',      rating: 2, review_text: 'Service was slow and the staff seemed disinterested.',            review_date: '2024-05-21', source: 'google', response_status: 'pending',   sentiment: 'negative', is_flagged: true  },
  { id: '3', author_name: 'Sarah K.',    rating: 5, review_text: 'Best experience I have had in years. Highly recommend.',         review_date: '2024-05-20', source: 'google', response_status: 'responded', sentiment: 'positive', is_flagged: false },
  { id: '4', author_name: 'James P.',    rating: 4, review_text: 'Great product quality, delivery was slightly delayed.',           review_date: '2024-05-19', source: 'google', response_status: 'responded', sentiment: 'positive', is_flagged: false },
  { id: '5', author_name: 'Anonymous',   rating: 1, review_text: 'Terrible experience. Never again.',                               review_date: '2024-05-18', source: 'google', response_status: 'pending',   sentiment: 'negative', is_flagged: true  },
  { id: '6', author_name: 'Linda M.',    rating: 5, review_text: 'Staff went above and beyond. Really impressed.',                  review_date: '2024-05-17', source: 'google', response_status: 'responded', sentiment: 'positive', is_flagged: false },
  { id: '7', author_name: 'Carlos R.',   rating: 3, review_text: 'Average. Not bad but not great either.',                          review_date: '2024-05-16', source: 'google', response_status: 'pending',   sentiment: 'neutral',  is_flagged: false },
  { id: '8', author_name: 'Jennifer W.', rating: 5, review_text: 'Fantastic. Would recommend to anyone looking for quality service.', review_date: '2024-05-15', source: 'google', response_status: 'responded', sentiment: 'positive', is_flagged: false },
];

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending:   'bg-amber-500/10 text-amber-400',
    drafted:   'bg-blue-500/10 text-blue-400',
    responded: 'bg-emerald-500/10 text-emerald-400',
    ignored:   'bg-zinc-500/10 text-zinc-400',
  };
  return map[status] ?? 'bg-zinc-500/10 text-zinc-400';
};

const ratingStars = (r: number) =>
  '★'.repeat(r) + '☆'.repeat(5 - r);

const ratingColor = (r: number) =>
  r >= 4 ? 'text-emerald-400' : r === 3 ? 'text-amber-400' : 'text-red-400';

export default async function ReviewsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const bizRes = await supabase
    .from('businesses').select('id').eq('user_id', user.id).maybeSingle();
  const business = bizRes.data as { id: string } | null;

  let reviews: Review[] = [];
  let usingDemo = true;

  if (business) {
    const { data } = await supabase
      .from('reviews')
      .select('id,author_name,rating,review_text,review_date,source,response_status,sentiment,is_flagged')
      .eq('business_id', business.id)
      .order('review_date', { ascending: false });
    reviews = (data as Review[]) ?? [];
    usingDemo = reviews.length === 0;
  }

  const displayReviews = usingDemo ? DEMO_REVIEWS : reviews;

  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-semibold text-foreground'>Reviews</h1>
          <p className='text-sm text-muted-foreground'>
            {displayReviews.length} review{displayReviews.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button className='flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground'>
          <Filter className='h-3.5 w-3.5' /> Filter
        </button>
      </div>

      {usingDemo && (
        <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400'>
          <span className='font-medium'>Demo data</span> — connect your Google Business Profile to see real reviews.
        </div>
      )}

      {/* Table */}
      <div className='overflow-hidden rounded-xl border border-border bg-card'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-border text-xs text-muted-foreground'>
              <th className='px-4 py-3 text-left font-medium'>Author</th>
              <th className='px-4 py-3 text-left font-medium'>Rating</th>
              <th className='px-4 py-3 text-left font-medium'>Review</th>
              <th className='px-4 py-3 text-left font-medium'>Date</th>
              <th className='px-4 py-3 text-left font-medium'>Source</th>
              <th className='px-4 py-3 text-left font-medium'>Status</th>
              <th className='px-4 py-3 text-left font-medium'>Action</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {displayReviews.map((r) => (
              <tr key={r.id} className='transition-colors hover:bg-muted/40'>
                <td className='px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <div className='flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300'>
                      {(r.author_name ?? '?')[0].toUpperCase()}
                    </div>
                    <span className='font-medium text-foreground'>{r.author_name ?? 'Anonymous'}</span>
                    {r.is_flagged && (
                      <span className='rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400'>!</span>
                    )}
                  </div>
                </td>
                <td className={`px-4 py-3 font-mono font-bold ${ratingColor(r.rating)}`}>
                  {r.rating} <span className='text-xs'>{ratingStars(r.rating)}</span>
                </td>
                <td className='max-w-xs px-4 py-3'>
                  <p className='line-clamp-2 text-xs text-muted-foreground'>{r.review_text ?? '—'}</p>
                </td>
                <td className='px-4 py-3 text-xs text-muted-foreground'>
                  {r.review_date ? new Date(r.review_date).toLocaleDateString() : '—'}
                </td>
                <td className='px-4 py-3'>
                  <span className='rounded-full bg-zinc-800 px-2 py-0.5 text-xs capitalize text-zinc-300'>
                    {r.source}
                  </span>
                </td>
                <td className='px-4 py-3'>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadge(r.response_status)}`}>
                    {r.response_status}
                  </span>
                </td>
                <td className='px-4 py-3'>
                  {r.response_status === 'pending' && (
                    <a href={`/response?reviewId=${r.id}`}
                      className='text-xs text-amber-400 underline-offset-2 hover:underline'>
                      Draft reply
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
