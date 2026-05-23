'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  Settings,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react';

import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Overview',      icon: LayoutDashboard },
  { href: '/reviews',    label: 'Reviews',        icon: Star },
  { href: '/alerts',     label: 'Alerts',         icon: Bell },
  { href: '/response',   label: 'AI Response',    icon: Sparkles },
  { href: '/settings',   label: 'Settings',       icon: Settings },
];

interface DashboardSidebarProps {
  businessName: string | null;
}

export function DashboardSidebar({ businessName }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className='flex h-screen w-60 flex-shrink-0 flex-col border-r border-border bg-card'>
      {/* Logo / brand */}
      <div className='flex items-center gap-2.5 border-b border-border px-5 py-4'>
        <div className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10'>
          <Shield className='h-4 w-4 text-amber-400' />
        </div>
        <div className='min-w-0'>
          <p className='text-sm font-semibold leading-none text-foreground'>Reputation Shield</p>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>
            {businessName ?? 'BotNest'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className='flex-1 space-y-0.5 overflow-y-auto px-2 py-3'>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className='h-4 w-4 flex-shrink-0' />
              <span>{label}</span>
              {active && <ChevronRight className='ml-auto h-3.5 w-3.5 opacity-60' />}
            </Link>
          );
        })}
      </nav>

      {/* Plan badge */}
      <div className='border-t border-border px-4 py-3'>
        <Link
          href='/settings'
          className='flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground'
        >
          <span className='inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400'>
            Starter
          </span>
          <span>Manage plan</span>
        </Link>
      </div>
    </aside>
  );
}
