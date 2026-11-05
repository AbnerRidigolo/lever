import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';

import { withSafety } from '@/lever/decorate';
import { createStubAdapter } from '@/lever/stub-adapter';
import { EMPTY_OVERRIDES } from '@/lever/stub-overrides';
import { createStoreMetrics, storeMetrics } from '@/server/metrics';

import { USER, captureLogger } from './helpers';

function fresh() {
  return createStoreMetrics(new Registry(), { defaultMetrics: false });
}

describe('section 10: SDK metrics exposed by the store', () => {
  it('section 10: counts evaluations by kind and key', async () => {
    const metrics = fresh();
    const lever = withSafety(
      createStubAdapter({ overrides: EMPTY_OVERRIDES, onExposure: () => undefined }),
      { logger: captureLogger().logger, observer: metrics.observer },
    );
    await lever.getFlag('new-banner', USER, false);
    await lever.getFlag('new-banner', USER, false);
    await lever.getVariant('checkout-layout', USER, 'one-page');

    const text = await metrics.registry.metrics();
    expect(text).toContain('lever_sdk_evaluations_total{kind="flag",key="new-banner"} 2');
    expect(text).toContain('lever_sdk_evaluations_total{kind="variant",key="checkout-layout"} 1');
  });

  it('section 10: counts evaluations that fell back after an error', async () => {
    const metrics = fresh();
    metrics.observer.failed('variant');
    expect(await metrics.registry.metrics()).toContain(
      'lever_sdk_evaluation_errors_total{kind="variant"} 1',
    );
  });

  it('section 10: exposes the configuration age, or no sample when unknown (stub)', async () => {
    const metrics = fresh();
    expect(await metrics.registry.metrics()).not.toMatch(/^lever_sdk_config_age_seconds\{/m);
    metrics.setConfigAgeSource(() => 3.5);
    expect(await metrics.registry.metrics()).toContain(
      'lever_sdk_config_age_seconds{source="lever"} 3.5',
    );
    metrics.setConfigAgeSource(() => null);
    expect(await metrics.registry.metrics()).not.toMatch(/^lever_sdk_config_age_seconds\{/m);
  });

  it('keeps one registry per process with the default Node metrics', async () => {
    expect(storeMetrics()).toBe(storeMetrics());
    expect(await storeMetrics().registry.metrics()).toContain('process_cpu_user_seconds_total');
  });
});
