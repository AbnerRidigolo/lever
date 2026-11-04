'use client';

import { useActionState } from 'react';

import type { ActionState } from '@/lib/action-state';

import { ActionMessage, SubmitButton } from './action-form';
import { Field, Input, Select } from './ui';

/** Creates an API key and shows the full key, which is never available again (AC-7.3). */
export function CreateApiKeyForm({
  action,
}: {
  action: (
    state: ActionState<{ key: string }>,
    form: FormData,
  ) => Promise<ActionState<{ key: string }>>;
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <Input name="name" required maxLength={120} />
        </Field>
        <Field label="Ambiente">
          <Select name="environment" defaultValue="development">
            <option value="development">development</option>
            <option value="production">production</option>
          </Select>
        </Field>
      </div>
      <div>
        <SubmitButton>Criar API key</SubmitButton>
      </div>
      <ActionMessage state={state} />
      {state.status === 'success' && state.data !== undefined ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950">
          <p className="mb-1 font-medium">Copie agora: esta key não será exibida de novo.</p>
          <code data-testid="new-api-key" className="break-all">
            {state.data.key}
          </code>
        </div>
      ) : null}
    </form>
  );
}
