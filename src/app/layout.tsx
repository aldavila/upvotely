import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/toaster';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Upvotely - Feedback Management That Grows With You',
    template: '%s | Upvotely',
  },
  description:
    'Collect, organize, and prioritize product feedback with flat pricing. No per-user fees. No surprise bills. Just better products.',
  keywords: [
    'feedback management',
    'feature requests',
    'product roadmap',
    'changelog',
    'customer feedback',
    'canny alternative',
    'uservoice alternative',
    'product management',
  ],
  authors: [{ name: 'Upvotely' }],
  creator: 'Upvotely',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://upvotely.io',
    siteName: 'Upvotely',
    title: 'Upvotely - Feedback Management That Grows With You',
    description:
      'Collect, organize, and prioritize product feedback with flat pricing. No per-user fees. No surprise bills.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Upvotely - Feedback Management',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Upvotely - Feedback Management That Grows With You',
    description:
      'Collect, organize, and prioritize product feedback with flat pricing.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              {children}
              <Toaster />
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
