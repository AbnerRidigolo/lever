import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card, PageTitle } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { lastOrderSchema, PAYMENT_LABELS, SHIPPING } from '@/server/checkout';
import { COOKIES, parseJsonCookie } from '@/server/cookies';

export const dynamic = 'force-dynamic';

export default async function ConfirmationPage() {
  const order = parseJsonCookie(lastOrderSchema, (await cookies()).get(COOKIES.lastOrder)?.value);
  if (order === undefined) redirect('/');

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageTitle>Pedido confirmado</PageTitle>
      <p>
        Obrigado! Seu pedido fictício <strong data-testid="order-number">{order.number}</strong> foi
        registrado. Nada será cobrado nem entregue.
      </p>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Itens</dt>
          <dd>{order.itemCount}</dd>
          <dt className="text-neutral-500">Subtotal</dt>
          <dd>{formatPrice(order.subtotalCents)}</dd>
          <dt className="text-neutral-500">Frete</dt>
          <dd>
            {SHIPPING[order.shipping].label} ({formatPrice(order.shippingCents)})
          </dd>
          <dt className="text-neutral-500">Pagamento</dt>
          <dd>{PAYMENT_LABELS[order.payment]}</dd>
          <dt className="text-neutral-500">Total</dt>
          <dd className="font-semibold" data-testid="order-total">
            {formatPrice(order.totalCents)}
          </dd>
        </dl>
      </Card>
      <Link href="/" className="underline">
        Voltar à vitrine
      </Link>
    </div>
  );
}
