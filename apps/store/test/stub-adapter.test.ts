import { exposureEventSchema, parseEnv, type ExposureEvent } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { createStubAdapter, STUB_CONFIG_VERSION } from '@/lever/stub-adapter';
import { EMPTY_OVERRIDES, mergeOverrides, stubOverridesSchema } from '@/lever/stub-overrides';
import { storeEnvSchema } from '@/server/env';

import { USER } from './helpers';

function stub(overrides = EMPTY_OVERRIDES) {
  const exposures: ExposureEvent[] = [];
  const adapter = createStubAdapter({
    overrides,
    onExposure: (event) => exposures.push(event),
    now: () => new Date('2026-11-03T12:00:00.000Z'),
  });
  return { adapter, exposures };
}

describe('stub adapter (store plan D1)', () => {
  it('AC-8.2: serves the default value of a flag without overrides', async () => {
    const { adapter } = stub();
    expect(await adapter.getFlag('new-banner', USER, false)).toBe(false);
    expect(await adapter.getFlag('new-banner', USER, true)).toBe(true);
  });

  it('AC-8.3: serves the fallback (control) variant without overrides', async () => {
    const { adapter } = stub();
    expect(await adapter.getVariant('checkout-layout', USER, 'one-page')).toBe('one-page');
  });

  it('AC-8.2, AC-8.3: overrides force a flag value and a variant', async () => {
    const { adapter } = stub(
      stubOverridesSchema.parse({
        flags: { 'new-banner': true },
        experiments: { 'checkout-layout': 'multi-step' },
      }),
    );
    expect(await adapter.getFlag('new-banner', USER, false)).toBe(true);
    expect(await adapter.getVariant('checkout-layout', USER, 'one-page')).toBe('multi-step');
  });

  it('ignores a forced flag value of another type', async () => {
    const { adapter } = stub(stubOverridesSchema.parse({ flags: { 'new-banner': 'yes' } }));
    expect(await adapter.getFlag('new-banner', USER, false)).toBe(false);
  });

  it('gives every user the same answer: no hashing nor bucketing', async () => {
    const { adapter } = stub();
    const variants = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        adapter.getVariant(
          'checkout-layout',
          { id: `user-${String(i)}`, attributes: {} },
          'one-page',
        ),
      ),
    );
    expect(new Set(variants)).toEqual(new Set(['one-page']));
  });

  it('AC-5.7: emits a valid exposure event on every variant evaluation', async () => {
    const { adapter, exposures } = stub();
    await adapter.getVariant('checkout-layout', USER, 'one-page');
    expect(exposures).toEqual([
      {
        type: 'exposure',
        experimentKey: 'checkout-layout',
        variantKey: 'one-page',
        userId: USER.id,
        configVersion: STUB_CONFIG_VERSION,
        timestamp: '2026-11-03T12:00:00.000Z',
      },
    ]);
    expect(exposureEventSchema.safeParse(exposures[0]).success).toBe(true);
  });

  it('has no configuration age', () => {
    expect(stub().adapter.configAgeSeconds()).toBeNull();
  });
});

describe('stub overrides', () => {
  it('the cookie overrides the environment, key by key', () => {
    const merged = mergeOverrides(
      stubOverridesSchema.parse({ flags: { 'new-banner': true, other: 1 } }),
      undefined,
      stubOverridesSchema.parse({ flags: { 'new-banner': false } }),
    );
    expect(merged.flags).toEqual({ 'new-banner': false, other: 1 });
    expect(merged.experiments).toEqual({});
  });

  it('rejects keys that are not kebab-case', () => {
    expect(stubOverridesSchema.safeParse({ experiments: { Checkout: 'x' } }).success).toBe(false);
  });

  it('reads LEVER_STUB_OVERRIDES from the environment as validated JSON', () => {
    const env = parseEnv(storeEnvSchema, {
      STORE_SESSION_SECRET: 'test-only-session-secret',
      LEVER_STUB_OVERRIDES: '{"flags":{"new-banner":true}}',
    });
    expect(env.LEVER_STUB_OVERRIDES).toEqual({ flags: { 'new-banner': true }, experiments: {} });
    expect(() =>
      parseEnv(storeEnvSchema, {
        STORE_SESSION_SECRET: 'test-only-session-secret',
        LEVER_STUB_OVERRIDES: '{not json',
      }),
    ).toThrow();
  });
});
