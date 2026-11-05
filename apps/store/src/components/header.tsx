import Link from 'next/link';

import { readCartView } from '@/server/cart-cookie';
import { getAccount } from '@/server/context';

export async function Header() {
  const [{ itemCount }, account] = await Promise.all([readCartView(), getAccount()]);
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-700">
          Loja Lever
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/">Vitrine</Link>
          <Link href="/cart">
            Carrinho (<span data-testid="cart-count">{itemCount}</span>)
          </Link>
          <Link href="/account">{account === undefined ? 'Entrar' : account.name}</Link>
        </nav>
      </div>
    </header>
  );
}
