import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CheckoutMultiStep } from '@/components/checkout-multi-step';
import { CheckoutOnePage } from '@/components/checkout-one-page';
import { OrderSummary } from '@/components/order-summary';
import { Badge, PageTitle } from '@/components/ui';
import { getCheckoutLayout } from '@/lever';
import { readCartView } from '@/server/cart-cookie';
import { parseCheckoutDraft, resolveStep } from '@/server/checkout';
import { COOKIES } from '@/server/cookies';

// The variant is decided here, on the server, before rendering: only the layout of the
// user's variant reaches the browser (AC-8.3, AC-8.5, store plan D6).
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cart = await readCartView();
  if (cart.lines.length === 0) redirect('/cart');

  const params = await searchParams;
  const layout = await getCheckoutLayout();
  const draft = parseCheckoutDraft((await cookies()).get(COOKIES.checkout)?.value);
  const error = params.error === '1';

  return (
    <div data-checkout-layout={layout} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>Finalizar compra</PageTitle>
        <Badge tone="amber">
          checkout-layout: <span data-testid="checkout-variant">{layout}</span>
        </Badge>
      </div>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        {layout === 'one-page' ? (
          <CheckoutOnePage draft={draft} error={error} />
        ) : (
          <CheckoutMultiStep step={resolveStep(params.step, draft)} draft={draft} error={error} />
        )}
        <OrderSummary cart={cart} />
      </div>
    </div>
  );
}
