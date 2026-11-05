import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Header } from '@/components/header';
import { LeverPanel } from '@/components/lever-panel';

import './globals.css';

export const metadata: Metadata = {
  title: 'Loja Lever',
  description: 'Loja de demonstração do Lever, com produtos fictícios',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <LeverPanel />
      </body>
    </html>
  );
}
