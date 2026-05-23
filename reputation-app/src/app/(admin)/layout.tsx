import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreditCard, LayoutDashboard,Shield, Users } from 'lucide-react';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

const NAV = [
  { href: '/admin',               label: 'Overview',      icon: LayoutDashboard },
  { href: '/admin/customers',     label: 'Customers',     icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isAdmin =
    user.user_metadata?.role === 'admin' ||
    (ADMIN_EMAIL && user.email === ADMIN_EMAIL);

  if (!isAdmin) redirect('/dashboard');

  return (
    <div className='flex min-h-screen bg-background'>
      {/* Sidebar */}
      <aside className='flex w-52 shrink-0 flex-col border-r border-border bg-card px-3 py-5'>
        <div className='mb-6 flex items-center gap-2 px-2'>
          <Shield className='h-5 w-5 text-amber-400' />
          <span className='text-sm font-semibold text-foreground'>Admin</span>
        </div>
        <nav className='flex flex-col gap-0.5'>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className='flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            >
              <Icon className='h-4 w-4' />
              {label}
            </Link>
          ))}
        </nav>
        <div className='mt-auto'>
          <Link
            href='/dashboard'
            className='flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground'
          >
            ← Back to App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className='flex-1 overflow-y-auto px-8 py-7'>{children}</main>
    </div>
  );
}
