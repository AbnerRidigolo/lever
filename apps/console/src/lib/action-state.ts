import type { ApiError } from '@lever/schemas';

/** Result of a Server Action, shown by the forms. Denied access never gets here: see runAction. */
export type ActionState<T = void> =
  | { status: 'idle' }
  | { status: 'success'; message?: string; data?: T }
  | { status: 'error'; error: ApiError['error'] };
