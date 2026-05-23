import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export const metadata = { title: 'Admin — Customers' };

type BusinessRow = {
  id: string;
  name: string;
  industry: string | null;
  contact_email: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
};

export default async function AdminCustomersPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('businesses')
    .select('id,name,industry,contact_email,onboarding_completed_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const businesses = (data as unknown as BusinessRow[]) ?? [];

  return (
    <div className='space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-foreground'>Customers</h1>
        <p className='text-sm text-muted-foreground'>{businesses.length} businesses registered.</p>
      </div>

      <div className='overflow-hidden rounded-xl border border-border bg-card'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-border text-xs text-muted-foreground'>
              <th className='px-4 py-3 text-left font-medium'>Business</th>
              <th className='px-4 py-3 text-left font-medium'>Industry</th>
              <th className='px-4 py-3 text-left font-medium'>Contact Email</th>
              <th className='px-4 py-3 text-left font-medium'>Onboarded</th>
              <th className='px-4 py-3 text-left font-medium'>Joined</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {businesses.map((b) => (
              <tr key={b.id} className='hover:bg-muted/40'>
                <td className='px-4 py-3 font-medium text-foreground'>{b.name}</td>
                <td className='px-4 py-3 text-muted-foreground'>{b.industry ?? '—'}</td>
                <td className='px-4 py-3 text-muted-foreground'>{b.contact_email ?? '—'}</td>
                <td className='px-4 py-3 text-xs text-muted-foreground'>
                  {b.onboarding_completed_at
                    ? new Date(b.onboarding_completed_at).toLocaleDateString()
                    : <span className='text-amber-400'>Pending</span>}
                </td>
                <td className='px-4 py-3 text-xs text-muted-foreground'>
                  {new Date(b.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr>
                <td colSpan={5} className='px-4 py-8 text-center text-sm text-muted-foreground'>
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
