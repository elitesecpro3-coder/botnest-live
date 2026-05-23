import { PropsWithChildren } from 'react';
import { redirect } from 'next/navigation';

import { DashboardHeader } from '@/components/app/dashboard-header';
import { DashboardSidebar } from '@/components/app/dashboard-sidebar';
import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

export default async function DashboardLayout({ children }: PropsWithChildren) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const bizRes = await supabase
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle();
  const business = bizRes.data as { id: string; name: string } | null;

  return (
    <div className='flex h-screen overflow-hidden bg-background'>
      <DashboardSidebar businessName={business?.name ?? null} />
      <div className='flex flex-1 flex-col overflow-hidden'>
        <DashboardHeader user={user} />
        <main className='flex-1 overflow-y-auto p-6'>{children}</main>
      </div>
    </div>
  );
}
