import { PropsWithChildren } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/utils/cn';
import { Analytics } from '@vercel/analytics/react';

import '@/styles/globals.css';

export const dynamic = 'force-dynamic';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'BotNest Reputation Shield',
    template: '%s | BotNest Reputation Shield',
  },
  description:
    'Monitor Google reviews, get instant bad-review alerts, and respond professionally. BotNest Reputation Shield helps local businesses build trust and grow through better online reputation.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang='en' className='dark'>
      <body className={cn('min-h-screen bg-background font-sans antialiased', inter.variable)}>
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
