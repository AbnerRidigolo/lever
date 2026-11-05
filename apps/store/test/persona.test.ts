import { describe, expect, it } from 'vitest';

import { resolveAttributes } from '@/server/attributes';
import {
  inputFromOverrides,
  overridesFromInput,
  personaFromInput,
  personaInputSchema,
  stubOverrideInputSchema,
} from '@/server/demo-controls';

describe('AC-8.4: demo persona', () => {
  it('AC-8.4: "auto" leaves the attribute to the headers', () => {
    expect(personaFromInput({ country: 'auto', device: 'auto' })).toBeUndefined();
    const persona = personaFromInput({ country: 'BR', device: 'auto' });
    expect(persona).toEqual({ country: 'BR' });
    expect(
      resolveAttributes({ userAgent: 'iPhone Mobile', acceptLanguage: 'en-US', persona }),
    ).toEqual({ country: 'BR', device: 'mobile' });
  });

  it('accepts only the offered options', () => {
    expect(personaInputSchema.safeParse({ country: 'BR', device: 'tablet' }).success).toBe(true);
    expect(personaInputSchema.safeParse({ country: 'FR', device: 'auto' }).success).toBe(false);
  });
});

describe('stub overrides from the Lever panel', () => {
  it('AC-8.2, AC-8.3: builds overrides for the flag and the experiment', () => {
    expect(overridesFromInput({ newBanner: 'on', checkoutLayout: 'multi-step' })).toEqual({
      flags: { 'new-banner': true },
      experiments: { 'checkout-layout': 'multi-step' },
    });
    expect(overridesFromInput({ newBanner: 'off', checkoutLayout: 'auto' })).toEqual({
      flags: { 'new-banner': false },
      experiments: {},
    });
    expect(overridesFromInput({ newBanner: 'auto', checkoutLayout: 'auto' })).toBeUndefined();
  });

  it('round-trips to the form values', () => {
    const input = { newBanner: 'off', checkoutLayout: 'one-page' } as const;
    expect(inputFromOverrides(overridesFromInput(input))).toEqual(input);
    expect(inputFromOverrides(undefined)).toEqual({ newBanner: 'auto', checkoutLayout: 'auto' });
  });

  it('rejects unknown variants', () => {
    expect(
      stubOverrideInputSchema.safeParse({ newBanner: 'on', checkoutLayout: 'express' }).success,
    ).toBe(false);
  });
});
