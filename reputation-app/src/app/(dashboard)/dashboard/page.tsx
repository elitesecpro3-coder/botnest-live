import { redirect } from 'next/navigation';
import { AlertTriangle, Bell, Star, TrendingUp } from 'lucide-react';

import { StatCard } from '@/components/app/stat-card';
import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Dashboard' };

// Demo data used until Google API sync is wired up
const DEMO_RECENT_REVIEWS = [
  { id: '1', author: 'Maria G.',  rating: 5, text: 'Absolutely love this place. Will be back!', date: '2 hours ago',   status: 'pending' },
  { id: '2', author: 'Tom B.',    rating: 2, text: 'Service was slow and the staff seemed disinterested.', date: '5 hours ago',   status: 'pending' },
  { id: '3', author: 'Sarah K.',  rating: 5, text: 'Best experience I have had in years. Highly recommend.', date: 'Yesterday',    status: 'responded' },
  { id: '4', author: 'James P.',  rating: 4, text: 'Great product, delivery was a little late.', date: '2 days ago', status: 'responded' },
  { id: '5', author: 'Anonymous', rating: 1, text: 'Terrible. Never again.', date: '3 days ago', status: 'pending' },
];

const ratingColor = (r: number) =>
  r >= 4 ? 'text-emerald-400' : r === 3 ? 'text-amber-400' : 'text-red-400';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Pull real counts when available; fall back to demo numbers
  const [reviewsRes, alertsRes] = await Promise.all([
    supabase.from('reviews').select('rating', { count: 'exact' }).eq('user_id', user.id),
    supabase.from('review_alerts').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'new'),
  ]);

  const totalReviews   = reviewsRes.count ?? 0;
  const openAlerts     = alertsRes.count ?? 0;
  const ratings        = ((reviewsRes.data as { rating: number }[] | null) ?? []).map((r) => r.rating);
  const avgRating      = ratings.length
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
    : '—';
  const negativeCount  = ratings.filter((r) => r <= 3).length;

  // Use demo data when DB is empty (MVP / dev mode)
  const usingDemo      = totalReviews === 0;
  const displayReviews = usingDemo ? DEMO_RECENT_REVIEWS : [];

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>Overview</h1>
        <p className='text-sm text-muted-foreground'>Your reputation at a glance.</p>
      </div>

      {/* Stats */}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <StatCard
          label='Total Reviews'
          value={usingDemo ? 47 : totalReviews}
          icon={Star}
          trend={usingDemo ? '+3 this week' : undefined}
          trendUp
          accent='amber'
        />
        <StatCard
          label='Average Rating'
          value={usingDemo ? '4.1' : avgRating}
          icon={TrendingUp}
          accent='green'
        />
        <StatCard
          label='Negative Reviews'
          value={usingDemo ? 5 : negativeCount}
          icon={AlertTriangle}
          trend={usingDemo ? '2 unresponded' : undefined}
          accent='red'
        />
        <StatCard
          label='Open Alerts'
          value={usingDemo ? 2 : openAlerts}
          icon={Bell}
          accent='red'
        />
      </div>

      {/* Demo banner */}
      {usingDemo && (
        <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400'>
          <span className='font-medium'>Demo mode</span> — showing sample data. Connect your Google Business Profile to see real reviews.
        </div>
      )}

      {/* Recent reviews */}
      <div className='rounded-xl border border-border bg-card'>
        <div className='flex items-center justify-between border-b border-border px-5 py-3'>
          <h2 className='text-sm font-medium text-foreground'>Recent Reviews</h2>
          <a href='/reviews' className='text-xs text-muted-foreground underline-offset-2 hover:underline'>
            View all
          </a>
        </div>
        <div className='divide-y divide-border'>
          {displayReviews.map((r) => (
            <div key={r.id} className='flex items-start gap-4 px-5 py-3.5'>
              <div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300'>
                {r.author[0]}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-sm font-medium text-foreground'>{r.author}</span>
                  <span className={`text-xs font-bold ${ratingColor(r.rating)}`}>
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </span>
                </div>
                <p className='mt-0.5 line-clamp-2 text-xs text-muted-foreground'>{r.text}</p>
                <div className='mt-1 flex items-center gap-2'>
                  <span className='text-xs text-muted-foreground'>{r.date}</span>
                  {r.status === 'pending' && r.rating <= 3 && (
                    <span className='rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-400'>
                      Needs response
                    </span>
                  )}
                  {r.status === 'responded' && (
                    <span className='rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-400'>
                      Responded
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
