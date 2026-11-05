import { z } from 'zod';

import { CHECKOUT_LAYOUT_EXPERIMENT, CHECKOUT_LAYOUTS, NEW_BANNER_FLAG } from '@/lever/keys';
import type { StubOverrides } from '@/lever/stub-overrides';

import { DEVICES, PERSONA_COUNTRIES, type Persona } from './attributes';

// Inputs of the Lever panel (store plan, D1 and D2). "auto" removes the choice.

export const personaInputSchema = z.object({
  country: z.enum(['auto', ...PERSONA_COUNTRIES]),
  device: z.enum(['auto', ...DEVICES]),
});

export function personaFromInput(input: z.infer<typeof personaInputSchema>): Persona | undefined {
  const persona: Persona = {};
  if (input.country !== 'auto') persona.country = input.country;
  if (input.device !== 'auto') persona.device = input.device;
  return Object.keys(persona).length === 0 ? undefined : persona;
}

export const stubOverrideInputSchema = z.object({
  newBanner: z.enum(['auto', 'on', 'off']),
  checkoutLayout: z.enum(['auto', ...CHECKOUT_LAYOUTS]),
});
export type StubOverrideInput = z.infer<typeof stubOverrideInputSchema>;

/** Overrides of one browser for the two resources of the store. */
export function overridesFromInput(input: StubOverrideInput): StubOverrides | undefined {
  const overrides: StubOverrides = { flags: {}, experiments: {} };
  if (input.newBanner !== 'auto') overrides.flags[NEW_BANNER_FLAG] = input.newBanner === 'on';
  if (input.checkoutLayout !== 'auto') {
    overrides.experiments[CHECKOUT_LAYOUT_EXPERIMENT] = input.checkoutLayout;
  }
  const empty =
    Object.keys(overrides.flags).length === 0 && Object.keys(overrides.experiments).length === 0;
  return empty ? undefined : overrides;
}

export function inputFromOverrides(overrides: StubOverrides | undefined): StubOverrideInput {
  const banner = overrides?.flags[NEW_BANNER_FLAG];
  const layout = z
    .enum(CHECKOUT_LAYOUTS)
    .safeParse(overrides?.experiments[CHECKOUT_LAYOUT_EXPERIMENT]);
  return {
    newBanner: typeof banner === 'boolean' ? (banner ? 'on' : 'off') : 'auto',
    checkoutLayout: layout.success ? layout.data : 'auto',
  };
}
