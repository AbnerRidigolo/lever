import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui';
import { loadOrDeny, pageContext } from '@/server/action';
import { hasRole, requireRole } from '@/server/authz';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await pageContext();
  const access = await loadOrDeny(() => requireRole(ctx, { slug }, 'viewer'));
  const base = `/projects/${slug}`;
  const links = [
    { href: `${base}/flags`, label: 'Flags' },
    { href: `${base}/experiments`, label: 'Experimentos' },
    { href: `${base}/segments`, label: 'Segmentos' },
    { href: `${base}/members`, label: 'Membros' },
    ...(hasRole(access.role, 'admin') ? [{ href: `${base}/api-keys`, label: 'API keys' }] : []),
    { href: `${base}/audit`, label: 'Auditoria' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{access.name}</span>
        <Badge>{access.role}</Badge>
      </div>
      <nav className="flex flex-wrap gap-3 border-b border-neutral-200 pb-2 text-sm dark:border-neutral-800">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
