'use client';

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import type { ActionState } from '@/lib/action-state';

import { Button } from './ui';

export function SubmitButton({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...(variant === undefined ? {} : { variant })}>
      {children}
    </Button>
  );
}

export function ActionMessage<T>({ state }: { state: ActionState<T> }) {
  if (state.status === 'success' && state.message !== undefined) {
    return (
      <p role="status" className="text-sm text-green-800 dark:text-green-300">
        {state.message}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="text-sm text-red-800 dark:text-red-300">
        <p>{state.error.message}</p>
        {state.error.details === undefined ? null : (
          <ul className="list-inside list-disc">
            {state.error.details.map((detail) => (
              <li key={`${detail.path}:${detail.message}`}>
                {detail.path === '' ? detail.message : `${detail.path}: ${detail.message}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return null;
}

/** A form bound to a Server Action, showing its result. */
export function ActionForm<T>({
  action,
  children,
  className,
}: {
  action: (state: ActionState<T>, form: FormData) => Promise<ActionState<T>>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state]);

  // Submitted by hand instead of `action={formAction}`: React resets a form after its action
  // runs, which would erase what the user typed whenever the server rejects it.
  return (
    <form
      ref={formRef}
      className={className ?? 'flex flex-col gap-3'}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => {
          formAction(data);
        });
      }}
    >
      {children}
      <ActionMessage state={state} />
    </form>
  );
}
