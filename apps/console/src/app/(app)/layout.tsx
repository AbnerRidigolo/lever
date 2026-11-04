import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (session?.user === undefined) redirect('/login');

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-4">
        <Link href="/projects" className="text-lg font-semibold">
          Lever
        </Link>
        <form action={logout} className="flex items-center gap-3">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {session.user.email}
          </span>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
