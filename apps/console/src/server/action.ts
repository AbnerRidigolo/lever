import { randomUUID } from 'node:crypto';

import { createApiError, createValidationError } from '@lever/schemas';
import { forbidden, notFound, redirect, unauthorized } from 'next/navigation';
import { ZodError } from 'zod';

import { auth } from '@/auth';
import type { ActionState } from '@/lib/action-state';

import type { ServiceContext } from './context';
import { db } from './db';
import { DomainError } from './errors';
import { logger } from './logger';

async function sessionUserId(): Promise<string | undefined> {
  const session = await auth();
  return session?.user?.id;
}

/** Context of a page: without a session, goes to the login screen. */
export async function pageContext(): Promise<ServiceContext> {
  const userId = await sessionUserId();
  if (userId === undefined) redirect('/login');
  return { db: db(), userId };
}

/** Loads the data of a page, turning access errors into the 404 and 403 screens. */
export async function loadOrDeny<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') notFound();
    if (error instanceof DomainError && error.code === 'forbidden') forbidden();
    throw error;
  }
}

/**
 * Runs a Server Action. Access errors become real HTTP responses (401, 403 and 404), even for a
 * forged call (AC-7.2); other failures come back as a state in the standard error format.
 */
export async function runAction<T>(
  operation: (ctx: ServiceContext) => Promise<T>,
  message?: string,
): Promise<ActionState<T>> {
  const userId = await sessionUserId();
  if (userId === undefined) unauthorized();

  const outcome = await attempt(operation, { db: db(), userId }, message);

  // These throw the navigation signals, so they stay outside the try block.
  if (outcome === 'forbidden') forbidden();
  if (outcome === 'not_found') notFound();
  return outcome;
}

async function attempt<T>(
  operation: (ctx: ServiceContext) => Promise<T>,
  ctx: ServiceContext,
  message: string | undefined,
): Promise<ActionState<T> | 'forbidden' | 'not_found'> {
  try {
    const data = await operation(ctx);
    const hasData = (data as unknown) !== undefined;
    return {
      status: 'success',
      ...(message === undefined ? {} : { message }),
      ...(hasData ? { data } : {}),
    };
  } catch (error) {
    return failureOf<T>(error);
  }
}

function failureOf<T>(error: unknown): ActionState<T> | 'forbidden' | 'not_found' {
  if (error instanceof ZodError) {
    return { status: 'error', error: createValidationError(error).error };
  }
  if (error instanceof DomainError) {
    if (error.code === 'forbidden') return 'forbidden';
    if (error.code === 'not_found') return 'not_found';
    return {
      status: 'error',
      error: createApiError(
        error.code,
        error.message,
        error.details === undefined ? {} : { details: error.details },
      ).error,
    };
  }
  const requestId = randomUUID();
  logger.error({ err: error, requestId }, 'server action failed');
  return {
    status: 'error',
    error: createApiError('internal', 'Erro interno. Tente novamente.', { requestId }).error,
  };
}
