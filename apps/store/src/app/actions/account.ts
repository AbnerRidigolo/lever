'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { accountIdSchema } from '@/accounts/accounts';
import { COOKIES, cookieOptions } from '@/server/cookies';
import { storeEnv } from '@/server/env';
import { logger } from '@/server/logger';
import { signValue } from '@/server/session';

const loginInputSchema = z.object({ accountId: accountIdSchema });

/** Logs in as a fictitious account: its id replaces the anonymous id (spec 001, section 13). */
export async function loginAction(formData: FormData): Promise<void> {
  const input = loginInputSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) {
    logger.warn('login with an unknown store account');
    redirect('/account?error=1');
  }
  const signed = signValue(input.data.accountId, storeEnv().STORE_SESSION_SECRET);
  (await cookies()).set(COOKIES.account, signed, cookieOptions('account'));
  redirect('/account');
}

/** Logs out; the anonymous id cookie was kept, so the previous id comes back. */
export async function logoutAction(): Promise<void> {
  (await cookies()).delete(COOKIES.account);
  redirect('/account');
}
