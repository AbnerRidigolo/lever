import Link from 'next/link';

import { cn } from '@/lib/utils';

export type BannerKind = 'new' | 'default';

/**
 * Home banner controlled by the `new-banner` flag (AC-8.2). Both versions have the same
 * height, so turning the flag on or off never shifts the page.
 */
export function Banner({ kind }: { kind: BannerKind }) {
  return (
    <section
      data-banner={kind}
      className={cn(
        'flex min-h-40 flex-col justify-center gap-2 rounded-xl px-6 py-8',
        kind === 'new'
          ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white'
          : 'border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
      )}
    >
      {kind === 'new' ? (
        <>
          <p className="text-xs font-semibold tracking-widest uppercase">Novidade</p>
          <h2 className="text-2xl font-bold">Coleção de primavera com frete grátis</h2>
          <p className="text-sm text-emerald-50">Produtos fictícios, descontos fictícios.</p>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">Bem-vindo à Loja Lever</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Uma loja de demonstração com produtos fictícios.
          </p>
        </>
      )}
      <Link href="/#produtos" className="mt-2 w-fit text-sm font-medium underline">
        Ver produtos
      </Link>
    </section>
  );
}
