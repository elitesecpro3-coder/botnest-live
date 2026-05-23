import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Admin — Subscriptions' };

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active:             'bg-emerald-500/10 text-emerald-400',
    trialing:           'bg-blue-500/10 text-blue-400',
    past_due:           'bg-red-500/10 text-red-400',
    canceled:           'bg-zinc-500/10 text-zinc-400',
    incomplete:         'bg-amber-500/10 text-amber-400',
    incomplete_expired: 'bg-zinc-500/10 text-zinc-400',
    unpaid:             'bg-red-500/10 text-red-400',
  };
  return map[status] ?? 'bg-zinc-500/10 text-zinc-400';
};

type SubRow = {
  id: string;
  user_id: string;
  status: string | null;
  price_id: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean | null;
  created: string;
};

export default async function AdminSubscriptionsPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('subscriptions')
    .select('id,user_id,status,price_id,current_period_end,cancel_at_period_end,created')
    .order('created', { ascending: false })
    .limit(100);

  const subs = (data as unknown as SubRow[]) ?? [];

  return (
    <div className='space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>Subscriptions</h1>
        <p className='text-sm text-muted-foreground'>{subs.length} subscriptions found.</p>
      </div>

      <div className='overflow-hidden rounded-xl border border-border bg-card'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-border text-xs text-muted-foreground'>
              <th className='px-4 py-3 text-left font-medium'>Subscription ID</th>
              <th className='px-4 py-3 text-left font-medium'>User ID</th>
              <th className='px-4 py-3 text-left font-medium'>Price ID</th>
              <th className='px-4 py-3 text-left font-medium'>Status</th>
              <th className='px-4 py-3 text-left font-medium'>Renews</th>
              <th className='px-4 py-3 text-left font-medium'>Cancel?</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {subs.map((s) => (
              <tr key={s.id} className='hover:bg-muted/40'>
                <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>{s.id.slice(0, 14)}…</td>
                <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>{s.user_id.slice(0, 8)}…</td>
                <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>{s.price_id?.slice(0, 16) ?? '—'}…</td>
                <td className='px-4 py-3'>
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadge(s.status ?? '')}`}>
                    {s.status ?? '—'}
                  </span>
                </td>
                <td className='px-4 py-3 text-xs text-muted-foreground'>
                  {s.current_period_end
                    ? new Date(s.current_period_end).toLocaleDateString()
                    : '—'}
                </td>
                <td className='px-4 py-3 text-xs'>
                  {s.cancel_at_period_end
                    ? <span className='text-amber-400'>Yes</span>
                    : <span className='text-muted-foreground'>No</span>}
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr>
                <td colSpan={6} className='px-4 py-8 text-center text-sm text-muted-foreground'>
                  No subscriptions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
