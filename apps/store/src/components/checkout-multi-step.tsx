import Link from 'next/link';

import { placeOrderAction, saveContactAction, saveDeliveryAction } from '@/app/actions/checkout';
import { cn } from '@/lib/utils';
import {
  MULTI_STEP_STEPS,
  PAYMENT_LABELS,
  SHIPPING,
  type CheckoutDraft,
  type Step,
} from '@/server/checkout';

import { ContactFields, DeliveryFields, FormError } from './checkout-fields';
import { Button } from './ui';

const STEP_LABELS: Record<Step, string> = { 1: 'Dados', 2: 'Entrega', 3: 'Revisão' };

/** Variant `multi-step` of `checkout-layout`: the same data in three steps (AC-8.3). */
export function CheckoutMultiStep({
  step,
  draft,
  error,
}: {
  step: Step;
  draft: CheckoutDraft | undefined;
  error: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2 text-sm" aria-label="Etapas">
        {MULTI_STEP_STEPS.map((item) => (
          <li
            key={item}
            aria-current={item === step ? 'step' : undefined}
            className={cn(
              'rounded-full border px-3 py-1',
              item === step
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-neutral-300 dark:border-neutral-700',
            )}
          >
            {item}. {STEP_LABELS[item]}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <form action={saveContactAction} className="flex flex-col gap-6">
          <FormError show={error} />
          <ContactFields defaults={draft?.contact} />
          <Button type="submit" className="w-fit">
            Continuar
          </Button>
        </form>
      ) : null}

      {step === 2 ? (
        <form action={saveDeliveryAction} className="flex flex-col gap-6">
          <FormError show={error} />
          <DeliveryFields defaults={draft?.delivery} />
          <div className="flex gap-3">
            <Link href="/checkout?step=1" className="self-center text-sm underline">
              Voltar
            </Link>
            <Button type="submit">Continuar</Button>
          </div>
        </form>
      ) : null}

      {step === 3 && draft?.contact !== undefined && draft.delivery !== undefined ? (
        <form action={placeOrderAction} className="flex flex-col gap-4">
          <input type="hidden" name="layout" value="multi-step" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">Nome</dt>
            <dd>{draft.contact.name}</dd>
            <dt className="text-neutral-500">Endereço</dt>
            <dd>
              {draft.contact.address}, {draft.contact.city}
            </dd>
            <dt className="text-neutral-500">Frete</dt>
            <dd>{SHIPPING[draft.delivery.shipping].label}</dd>
            <dt className="text-neutral-500">Pagamento</dt>
            <dd>{PAYMENT_LABELS[draft.delivery.payment]}</dd>
          </dl>
          <div className="flex gap-3">
            <Link href="/checkout?step=2" className="self-center text-sm underline">
              Voltar
            </Link>
            <Button type="submit">Confirmar pedido</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
