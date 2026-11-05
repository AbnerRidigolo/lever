import {
  PAYMENT_LABELS,
  PAYMENT_OPTIONS,
  SHIPPING,
  SHIPPING_OPTIONS,
  type Contact,
  type Delivery,
} from '@/server/checkout';

import { Field, Input, Select } from './ui';

export function ContactFields({ defaults }: { defaults: Contact | undefined }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-semibold">Dados de entrega (fictícios)</legend>
      <Field label="Nome">
        <Input name="name" required minLength={2} maxLength={80} defaultValue={defaults?.name} />
      </Field>
      <Field label="Endereço">
        <Input
          name="address"
          required
          minLength={5}
          maxLength={160}
          defaultValue={defaults?.address}
        />
      </Field>
      <Field label="Cidade">
        <Input name="city" required minLength={2} maxLength={80} defaultValue={defaults?.city} />
      </Field>
    </fieldset>
  );
}

export function DeliveryFields({ defaults }: { defaults: Delivery | undefined }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-semibold">Entrega e pagamento</legend>
      <Field label="Frete">
        <Select name="shipping" required defaultValue={defaults?.shipping ?? 'standard'}>
          {SHIPPING_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SHIPPING[option].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pagamento">
        <Select name="payment" required defaultValue={defaults?.payment ?? 'pix'}>
          {PAYMENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {PAYMENT_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-neutral-500">
        Pagamento fictício: nenhum dado de cartão é pedido nem guardado.
      </p>
    </fieldset>
  );
}

export function FormError({ show }: { show: boolean }) {
  return show ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      Confira os campos e tente de novo.
    </p>
  ) : null;
}
