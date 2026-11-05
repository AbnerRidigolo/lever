import { placeOrderAction } from '@/app/actions/checkout';
import type { CheckoutDraft } from '@/server/checkout';

import { ContactFields, DeliveryFields, FormError } from './checkout-fields';
import { Button } from './ui';

/** Variant `one-page` (control) of `checkout-layout`: everything in one form (AC-8.3). */
export function CheckoutOnePage({
  draft,
  error,
}: {
  draft: CheckoutDraft | undefined;
  error: boolean;
}) {
  return (
    <form action={placeOrderAction} className="flex flex-col gap-6">
      <input type="hidden" name="layout" value="one-page" />
      <FormError show={error} />
      <ContactFields defaults={draft?.contact} />
      <DeliveryFields defaults={draft?.delivery} />
      <Button type="submit" className="w-fit">
        Confirmar pedido
      </Button>
    </form>
  );
}
