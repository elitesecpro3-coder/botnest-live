'use client';

import { Bell, ChevronDown,LogOut } from 'lucide-react';

import { signOut } from '@/app/(auth)/auth-actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User } from '@supabase/supabase-js';

interface DashboardHeaderProps {
  user: User;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const displayName = user.user_metadata?.full_name ?? user.email ?? 'Account';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className='flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card px-6'>
      <div />
      <div className='flex items-center gap-3'>
        {/* Alerts icon */}
        <Button variant='ghost' size='icon' className='relative h-8 w-8 text-muted-foreground'>
          <Bell className='h-4 w-4' />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className='flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground'>
              <span className='flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-400'>
                {initials}
              </span>
              <span className='max-w-[140px] truncate'>{displayName}</span>
              <ChevronDown className='h-3.5 w-3.5 opacity-50' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48'>
            <DropdownMenuItem disabled className='text-xs text-muted-foreground'>
              {user.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href='/settings'>Account Settings</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='text-destructive focus:text-destructive'
              onSelect={async () => {
                await signOut();
                window.location.href = '/login';
              }}
            >
              <LogOut className='mr-2 h-4 w-4' />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
