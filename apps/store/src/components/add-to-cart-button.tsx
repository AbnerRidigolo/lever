'use client';

import { useActionState } from 'react';

import { addToCartAction, type AddToCartState } from '@/app/actions/cart';

import { Button } from './ui';

const MESSAGES: Record<AddToCartState['status'], string> = {
  idle: '',
  added: 'Adicionado ao carrinho.',
  full: 'O carrinho está cheio.',
  invalid: 'Não foi possível adicionar este produto.',
};

// Client component only for the pending state and the confirmation message.
export function AddToCartButton({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<AddToCartState, FormData>(addToCartAction, {
    status: 'idle',
  });
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Adicionando...' : 'Adicionar ao carrinho'}
      </Button>
      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {MESSAGES[state.status]}
      </p>
    </form>
  );
}
