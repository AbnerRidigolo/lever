import { formatPrice } from '@/lib/format';
import type { CartView } from '@/server/cart';

import { Card } from './ui';

export function OrderSummary({ cart }: { cart: CartView }) {
  return (
    <Card title="Resumo do pedido" className="h-fit">
      <ul className="flex flex-col gap-1 text-sm">
        {cart.lines.map(({ product, quantity, subtotalCents }) => (
          <li key={product.id} className="flex justify-between gap-4">
            <span>
              {quantity}× {product.name}
            </span>
            <span>{formatPrice(subtotalCents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold dark:border-neutral-800">
        <span>Subtotal</span>
        <span>{formatPrice(cart.totalCents)}</span>
      </p>
    </Card>
  );
}
