import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';

import './globals.css';
import { Providers } from '@/components/layout/providers';

const heading = Space_Grotesk({ subsets: ['latin'], variable: '--font-heading' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'Trust Tower | AI Safety Layer',
  description: 'Control tower for Epic-native predictive risk governance.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${heading.variable} ${mono.variable}`}>
      <body className="font-[var(--font-heading)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
