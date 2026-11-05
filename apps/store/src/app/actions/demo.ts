'use server';

import { cookies } from 'next/headers';

import { COOKIES, cookieOptions } from '@/server/cookies';
import {
  overridesFromInput,
  personaFromInput,
  personaInputSchema,
  stubOverrideInputSchema,
} from '@/server/demo-controls';
import { leverAdapterMode } from '@/server/env';
import { logger } from '@/server/logger';

/** Demo persona: overrides `country` and `device` for this browser (store plan, D2). */
export async function setPersonaAction(formData: FormData): Promise<void> {
  const input = personaInputSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) {
    logger.warn('invalid persona request');
    return;
  }
  const cookieStore = await cookies();
  const persona = personaFromInput(input.data);
  if (persona === undefined) cookieStore.delete(COOKIES.persona);
  else cookieStore.set(COOKIES.persona, JSON.stringify(persona), cookieOptions('persona'));
}

/** Values forced by the stub for this browser; ignored outside the stub mode (store plan, D1). */
export async function setStubOverridesAction(formData: FormData): Promise<void> {
  const input = stubOverrideInputSchema.safeParse(Object.fromEntries(formData.entries()));
  if (leverAdapterMode() !== 'stub' || !input.success) {
    logger.warn('invalid stub override request');
    return;
  }
  const cookieStore = await cookies();
  const overrides = overridesFromInput(input.data);
  if (overrides === undefined) cookieStore.delete(COOKIES.stubOverrides);
  else {
    cookieStore.set(
      COOKIES.stubOverrides,
      JSON.stringify(overrides),
      cookieOptions('stubOverrides'),
    );
  }
}
