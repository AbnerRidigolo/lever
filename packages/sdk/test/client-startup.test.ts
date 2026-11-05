import { afterEach, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig } from './fixtures.js';
import { eventually } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

describe('client startup with the decision service down (AC-5.5, D2)', () => {
  it('ready() resolves unauthorized right away when the API key is rejected', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.failWith = 401;
    const { client } = createTestClient(fake.url);

    const started = Date.now();
    expect(await client.ready({ timeoutMs: 10_000 })).toBe('unauthorized');
    expect(Date.now() - started).toBeLessThan(5_000);
    // A later call does not wait either, and evaluations keep serving the defaults.
    expect(await client.ready({ timeoutMs: 10_000 })).toBe('unauthorized');
    expect(client.getFlag('new-banner', brUser, false)).toBe(false);
  });

  it('AC-5.5: serves defaults, times out ready() and picks up the config when the service comes up', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    await fake.stop();
    const { client } = createTestClient(fake.url);

    expect(client.getFlag('new-banner', brUser, false)).toBe(false);
    expect(client.getFlag('headline', brUser, 'Default')).toBe('Default');
    expect(client.getVariant('checkout-layout', brUser)).toBeNull();
    expect(await client.ready({ timeoutMs: 100 })).toBe('timeout');

    const pending = client.ready({ timeoutMs: 5_000 });
    await fake.restart();
    expect(await pending).toBe('ready');
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
    expect(client.getVariant('checkout-layout', brUser)).toBe('one-page');
  });

  it('AC-5.5: serves defaults while the service answers 503 and recovers', async () => {
    fake = await FakeDecision.start({ config: null });
    const { client } = createTestClient(fake.url);
    await eventually(() => {
      expect(fake?.streamRequests()).toBeGreaterThanOrEqual(2);
    });
    expect(client.getFlag('new-banner', brUser, false)).toBe(false);

    fake.config = testConfig(1);
    expect(await client.ready()).toBe('ready');
  });

  it('resolves pending ready() calls with closed on close()', async () => {
    fake = await FakeDecision.start({ config: null });
    const { client } = createTestClient(fake.url);
    const pending = client.ready({ timeoutMs: 10_000 });
    await client.close();
    expect(await pending).toBe('closed');
  });
});
