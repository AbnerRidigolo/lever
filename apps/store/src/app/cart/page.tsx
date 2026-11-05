import Link from 'next/link';

import { CartTable } from '@/components/cart-table';
import { PageTitle } from '@/components/ui';
import { readCartView } from '@/server/cart-cookie';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cart = await readCartView();
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Carrinho</PageTitle>
      {cart.lines.length === 0 ? (
        <p>
          Seu carrinho está vazio.{' '}
          <Link href="/" className="underline">
            Ver produtos
          </Link>
        </p>
      ) : (
        <CartTable cart={cart} />
      )}
    </div>
  );
}
