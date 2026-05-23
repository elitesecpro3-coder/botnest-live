import { LucideIcon } from 'lucide-react';

import { cn } from '@/utils/cn';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: 'default' | 'amber' | 'red' | 'green';
}

const accentMap = {
  default: 'bg-zinc-800/60 text-zinc-400',
  amber:   'bg-amber-500/10 text-amber-400',
  red:     'bg-red-500/10 text-red-400',
  green:   'bg-emerald-500/10 text-emerald-400',
};

export function StatCard({ label, value, icon: Icon, trend, trendUp, accent = 'default' }: StatCardProps) {
  return (
    <div className='rounded-xl border border-border bg-card p-5'>
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='mt-1 text-2xl font-semibold text-foreground'>{value}</p>
          {trend && (
            <p className={cn('mt-1 text-xs', trendUp ? 'text-emerald-400' : 'text-red-400')}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', accentMap[accent])}>
          <Icon className='h-5 w-5' />
        </div>
      </div>
    </div>
  );
}
