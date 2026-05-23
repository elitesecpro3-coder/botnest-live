import { redirect } from 'next/navigation';
import { Bell, CheckCircle2 } from 'lucide-react';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Alerts' };

type Alert = {
  id: string;
  alert_type: string;
  status: string;
  title: string;
  message: string | null;
  created_at: string;
  review_id: string | null;
};

const DEMO_ALERTS: Alert[] = [
  { id: '1', alert_type: 'negative_review', status: 'new',      title: '1-star review from Anonymous',      message: 'A new 1-star review was posted on Google. Immediate response recommended.',        created_at: '2024-05-18T10:22:00Z', review_id: '5' },
  { id: '2', alert_type: 'negative_review', status: 'new',      title: '2-star review from Tom B.',         message: 'A new 2-star review was posted on Google. A prompt reply can help recover trust.', created_at: '2024-05-21T07:45:00Z', review_id: '2' },
  { id: '3', alert_type: 'low_rating',      status: 'resolved', title: 'Average rating dropped below 4.0', message: 'Your average Google rating is now 3.9. Responding to recent negatives can help.',   created_at: '2024-05-15T14:00:00Z', review_id: null },
  { id: '4', alert_type: 'negative_review', status: 'dismissed', title: '2-star review from Pat D.',        message: 'A new 2-star review was posted on Google.',                                         created_at: '2024-05-10T09:11:00Z', review_id: null },
];

const alertTypeBadge = (type: string) => {
  const map: Record<string, string> = {
    negative_review: 'bg-red-500/10 text-red-400',
    low_rating:      'bg-amber-500/10 text-amber-400',
    no_response:     'bg-blue-500/10 text-blue-400',
  };
  const label: Record<string, string> = {
    negative_review: 'Negative Review',
    low_rating:      'Low Rating',
    no_response:     'No Response',
  };
  return { cls: map[type] ?? 'bg-zinc-500/10 text-zinc-400', label: label[type] ?? type };
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    new:      'bg-red-500/10 text-red-400',
    seen:     'bg-amber-500/10 text-amber-400',
    resolved: 'bg-emerald-500/10 text-emerald-400',
    dismissed:'bg-zinc-500/10 text-zinc-400',
  };
  return map[status] ?? 'bg-zinc-500/10 text-zinc-400';
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default async function AlertsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const bizRes = await supabase
    .from('businesses').select('id').eq('user_id', user.id).maybeSingle();
  const business = bizRes.data as { id: string } | null;

  let alerts: Alert[] = [];
  let usingDemo = true;

  if (business) {
    const { data } = await supabase
      .from('review_alerts')
      .select('id,alert_type,status,title,message,created_at,review_id')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    alerts = (data as Alert[]) ?? [];
    usingDemo = alerts.length === 0;
  }

  const displayAlerts = usingDemo ? DEMO_ALERTS : alerts;
  const openCount = displayAlerts.filter((a) => a.status === 'new' || a.status === 'seen').length;

  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-semibold text-foreground'>Alerts</h1>
          <p className='text-sm text-muted-foreground'>
            {openCount} open alert{openCount !== 1 ? 's' : ''}
          </p>
        </div>
        {openCount > 0 && (
          <div className='flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10'>
            <Bell className='h-4 w-4 text-red-400' />
          </div>
        )}
      </div>

      {usingDemo && (
        <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400'>
          <span className='font-medium'>Demo data</span> — connect your Google Business Profile to receive real alerts.
        </div>
      )}

      <div className='space-y-3'>
        {displayAlerts.map((a) => {
          const type = alertTypeBadge(a.alert_type);
          return (
            <div
              key={a.id}
              className={`rounded-xl border bg-card p-4 transition-colors ${
                a.status === 'new' ? 'border-red-500/30' : 'border-border'
              }`}
            >
              <div className='flex items-start justify-between gap-4'>
                <div className='min-w-0 flex-1'>
                  <div className='mb-1.5 flex flex-wrap items-center gap-2'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${type.cls}`}>
                      {type.label}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadge(a.status)}`}>
                      {a.status}
                    </span>
                    <span className='text-xs text-muted-foreground'>{formatDate(a.created_at)}</span>
                  </div>
                  <p className='text-sm font-medium text-foreground'>{a.title}</p>
                  {a.message && (
                    <p className='mt-0.5 text-xs text-muted-foreground'>{a.message}</p>
                  )}
                </div>

                <div className='flex shrink-0 items-center gap-3'>
                  {a.review_id && (a.status === 'new' || a.status === 'seen') && (
                    <a
                      href={`/response?reviewId=${a.review_id}`}
                      className='text-xs text-amber-400 underline-offset-2 hover:underline'
                    >
                      Draft reply
                    </a>
                  )}
                  {(a.status === 'new' || a.status === 'seen') && (
                    <button
                      disabled
                      title='Mark resolved (coming soon)'
                      className='flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground opacity-60'
                    >
                      <CheckCircle2 className='h-3.5 w-3.5' /> Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {displayAlerts.length === 0 && (
          <div className='rounded-xl border border-border bg-card px-6 py-12 text-center'>
            <Bell className='mx-auto mb-3 h-8 w-8 text-muted-foreground/40' />
            <p className='text-sm text-muted-foreground'>No alerts yet. You&apos;ll be notified when new negative reviews arrive.</p>
          </div>
        )}
      </div>
    </div>
  );
}
