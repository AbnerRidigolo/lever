import type { ExposureEvent, FlagValue, UserContext } from '@lever/schemas';
import { createLeverClient, type LeverClient, type LeverClientMetrics } from '@lever/sdk';
import { describe, expect, it } from 'vitest';

import { createSdkAdapter, startSdk } from '@/lever/sdk-adapter';

import { USER, captureLogger } from './helpers';

const METRICS: LeverClientMetrics = {
  flagEvaluations: 0,
  experimentEvaluations: 0,
  evaluationErrors: 0,
  invalidMessages: 0,
  reconnects: 0,
  configVersion: 4,
  configAgeMs: 2_500,
  connection: 'connected',
};

/** A fake of the SDK surface the adapter uses: answers come from the test. */
function fakeClient(answers: {
  flag?: (key: string, defaultValue: FlagValue) => FlagValue;
  variant?: string | null;
  metrics?: Partial<LeverClientMetrics>;
  ready?: string;
}) {
  const exposureListeners: ((event: ExposureEvent) => void)[] = [];
  const calls: { key: string; user: UserContext; defaultValue: FlagValue }[] = [];
  const client = {
    getFlag: (key: string, user: UserContext, defaultValue: FlagValue) => {
      calls.push({ key, user, defaultValue });
      return answers.flag?.(key, defaultValue) ?? defaultValue;
    },
    getVariant: () => (answers.variant === undefined ? null : answers.variant),
    getMetrics: () => ({ ...METRICS, ...answers.metrics }),
    onExposure: (listener: (event: ExposureEvent) => void) => {
      exposureListeners.push(listener);
      return () => undefined;
    },
    ready: () => Promise.resolve(answers.ready ?? 'ready'),
    close: () => Promise.resolve(),
  } as unknown as LeverClient;
  return { client, calls, exposureListeners };
}

describe('SDK adapter (store plan T12)', () => {
  it('AC-5.1, AC-8.2: passes flags through the typed overload of the default value', async () => {
    const { client, calls } = fakeClient({ flag: () => true });
    const adapter = createSdkAdapter(client);
    expect(await adapter.getFlag('new-banner', USER, false)).toBe(true);
    expect(await adapter.getFlag('limit', USER, 3)).toBe(true);
    expect(calls.map((call) => call.defaultValue)).toEqual([false, 3]);
  });

  it('serves a null default without calling the SDK', async () => {
    const { client, calls } = fakeClient({});
    expect(await createSdkAdapter(client).getFlag('anything', USER, null)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('AC-5.2, AC-8.3: returns the variant, and the fallback when the SDK answers null', async () => {
    expect(
      await createSdkAdapter(fakeClient({ variant: 'multi-step' }).client).getVariant(
        'checkout-layout',
        USER,
        'one-page',
      ),
    ).toBe('multi-step');
    expect(
      await createSdkAdapter(fakeClient({ variant: null }).client).getVariant(
        'checkout-layout',
        USER,
        'one-page',
      ),
    ).toBe('one-page');
  });

  it('section 10: converts the configuration age to seconds and exposes the version', () => {
    const adapter = createSdkAdapter(fakeClient({}).client);
    expect(adapter.configAgeSeconds()).toBe(2.5);
    expect(adapter.configVersion()).toBe(4);

    const empty = createSdkAdapter(
      fakeClient({ metrics: { configAgeMs: null, configVersion: null } }).client,
    );
    expect(empty.configAgeSeconds()).toBeNull();
    expect(empty.configVersion()).toBeNull();
  });
});

describe('SDK start-up', () => {
  function start(ready: string) {
    const fake = fakeClient({ ready });
    const { logger, lines } = captureLogger();
    const runtime = startSdk({
      apiKey: 'lvr_dev_fictitious',
      baseUrl: 'http://localhost:4102',
      logger,
      create: () => fake.client,
    });
    return { ...fake, runtime, lines };
  }

  it('is ready when the first configuration arrives', async () => {
    const { runtime, lines } = start('ready');
    expect(await runtime.ready).toBe(true);
    expect(lines).toEqual([]);
  });

  it.each(['timeout', 'closed', 'unauthorized', 'a-result-added-later'])(
    'AC-5.5: "%s" means serving defaults, with a warning',
    async (result) => {
      const { runtime, lines } = start(result);
      expect(await runtime.ready).toBe(false);
      expect(lines[0]).toMatchObject({ level: 40, result });
    },
  );

  it('AC-5.7: logs the exposures of the SDK without the user id', () => {
    const { exposureListeners, lines } = start('ready');
    expect(exposureListeners).toHaveLength(1);
    exposureListeners[0]?.({
      type: 'exposure',
      experimentKey: 'checkout-layout',
      variantKey: 'multi-step',
      userId: USER.id,
      configVersion: 3,
      timestamp: '2026-11-04T12:00:00.000Z',
    });
    expect(lines[0]).toMatchObject({ msg: 'exposure', variantKey: 'multi-step' });
    expect(JSON.stringify(lines)).not.toContain(USER.id);
  });

  it('AC-5.5: with the decision service down, the real SDK serves defaults', async () => {
    const { logger, lines } = captureLogger();
    const runtime = startSdk({
      apiKey: `lvr_dev_${'0'.repeat(43)}`,
      // Port 9 (discard): nothing listens there.
      baseUrl: 'http://127.0.0.1:9',
      logger,
      create: createLeverClient,
    });
    try {
      expect(await runtime.ready).toBe(false);
      const adapter = createSdkAdapter(runtime.client);
      expect(await adapter.getFlag('new-banner', USER, false)).toBe(false);
      expect(await adapter.getVariant('checkout-layout', USER, 'one-page')).toBe('one-page');
      expect(adapter.configVersion()).toBeNull();
      expect(lines.some((line) => line.result === 'timeout')).toBe(true);
    } finally {
      await runtime.client.close();
    }
  });
});
