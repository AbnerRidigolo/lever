import { afterEach, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig } from './fixtures.js';
import { eventually, sleep } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

describe('stream down after startup (AC-5.6)', () => {
  it('AC-5.6: keeps evaluating with the last valid config while the service is down', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { client } = createTestClient(fake.url);
    expect(await client.ready()).toBe('ready');

    await fake.stop();
    await sleep(100);
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
    expect(client.getVariant('checkout-layout', brUser)).toBe('one-page');

    const updated = testConfig(2);
    fake.config = {
      ...updated,
      flags: updated.flags.map((flag) =>
        flag.key === 'new-banner' ? { ...flag, enabled: false } : flag,
      ),
    };
    await fake.restart();
    await eventually(() => {
      expect(client.getFlag('new-banner', brUser, true)).toBe(false);
    });
  });

  it('AC-5.6: keeps the last valid config when the stream drops and reconnects', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { client } = createTestClient(fake.url);
    await client.ready();

    fake.dropStreams();
    expect(client.getFlag('headline', brUser, 'x')).toBe('Hello');
    await eventually(() => {
      expect(fake?.streamRequests()).toBe(2);
    });
    expect(client.getFlag('headline', brUser, 'x')).toBe('Hello');
  });

  it('keeps the last config after a 401 (revoked key) and stops reconnecting', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { client } = createTestClient(fake.url);
    await client.ready();

    fake.failWith = 401;
    fake.dropStreams();
    await eventually(() => {
      expect(fake?.streamRequests()).toBe(2);
    });
    await sleep(100);
    expect(fake.streamRequests()).toBe(2);
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
  });

  it('keeps evaluating with the last config after close()', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { client } = createTestClient(fake.url);
    await client.ready();
    await client.close();
    expect(await client.ready()).toBe('closed');
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
  });
});
