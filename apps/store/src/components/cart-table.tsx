import Link from 'next/link';

import { removeFromCartAction, updateQuantityAction } from '@/app/actions/cart';
import { formatPrice } from '@/lib/format';
import { MAX_QUANTITY, type CartView } from '@/server/cart';

import { ProductIllustration } from './product-illustration';
import { Button, Input } from './ui';

// Plain forms: the cart works even without JavaScript.
export function CartTable({ cart }: { cart: CartView }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {cart.lines.map(({ product, quantity, subtotalCents }) => (
          <li
            key={product.id}
            data-testid="cart-line"
            className="flex flex-wrap items-center gap-4 py-3"
          >
            <ProductIllustration product={product} className="w-16" />
            <div className="flex min-w-40 flex-1 flex-col">
              <Link href={`/products/${product.slug}`} className="font-medium hover:underline">
                {product.name}
              </Link>
              <span className="text-sm text-neutral-500">{formatPrice(product.priceCents)}</span>
            </div>
            <form action={updateQuantityAction} className="flex items-center gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <Input
                type="number"
                name="quantity"
                min={0}
                max={MAX_QUANTITY}
                defaultValue={quantity}
                aria-label={`Quantidade de ${product.name}`}
                className="w-20"
              />
              <Button type="submit" variant="secondary" size="sm">
                Atualizar
              </Button>
            </form>
            <span className="w-28 text-right font-semibold">{formatPrice(subtotalCents)}</span>
            <form action={removeFromCartAction}>
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit" variant="ghost" size="sm">
                Remover
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <span className="text-lg">
          Total: <strong data-testid="cart-total">{formatPrice(cart.totalCents)}</strong>
        </span>
        <Link
          href="/checkout"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Finalizar compra
        </Link>
      </div>
    </div>
  );
}
