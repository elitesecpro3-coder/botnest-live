import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Admin — Overview' };

export default async function AdminOverviewPage() {
  const supabase = await createSupabaseServerClient();

  const [usersRes, businessesRes, reviewsRes, subsRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('businesses').select('id', { count: 'exact', head: true }),
    supabase.from('reviews').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  const stats = [
    { label: 'Total Users',       value: usersRes.count      ?? 0 },
    { label: 'Businesses',        value: businessesRes.count ?? 0 },
    { label: 'Total Reviews',     value: reviewsRes.count    ?? 0 },
    { label: 'Active Subs',       value: subsRes.count       ?? 0 },
  ];

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>Admin Overview</h1>
        <p className='text-sm text-muted-foreground'>Internal metrics — visible to admins only.</p>
      </div>

      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {stats.map(({ label, value }) => (
          <div key={label} className='rounded-xl border border-border bg-card p-5'>
            <p className='text-xs text-muted-foreground'>{label}</p>
            <p className='mt-1 text-2xl font-bold text-foreground'>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
