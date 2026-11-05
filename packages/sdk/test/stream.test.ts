import { afterEach, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { FakeDecision, formatEvent } from './fake-decision.js';
import { brUser, testConfig } from './fixtures.js';
import { eventually } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

function withBanner(version: number, enabled: boolean) {
  const config = testConfig(version);
  return {
    ...config,
    flags: config.flags.map((flag) => (flag.key === 'new-banner' ? { ...flag, enabled } : flag)),
  };
}

describe('updates through the stream (AC-5.4, D8)', () => {
  it('AC-5.4: applies a new configuration without recreating the client', async () => {
    fake = await FakeDecision.start({ config: withBanner(1, false) });
    const { client } = createTestClient(fake.url);
    await client.ready();
    expect(client.getFlag('new-banner', brUser, false)).toBe(false);

    fake.pushConfig(withBanner(2, true));
    await eventually(() => {
      expect(client.getFlag('new-banner', brUser, false)).toBe(true);
    });

    fake.pushConfig(withBanner(3, false));
    await eventually(() => {
      expect(client.getFlag('new-banner', brUser, false)).toBe(false);
    });
  });

  it('discards an invalid message, keeps the last valid config and the connection', async () => {
    fake = await FakeDecision.start({ config: withBanner(1, true) });
    const { client, logger } = createTestClient(fake.url);
    await client.ready();

    fake.broadcast('event: config\ndata: {"version":2,"flags":"oops"}\n\n');
    fake.broadcast('event: config\ndata: not json\n\n');
    await eventually(() => {
      expect(
        logger.at(
          'error',
          'invalid stream message discarded; keeping the last valid configuration',
        ),
      ).toHaveLength(2);
    });
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
    expect(fake.streamRequests()).toBe(1);

    fake.pushConfig(withBanner(2, false));
    await eventually(() => {
      expect(client.getFlag('new-banner', brUser, true)).toBe(false);
    });
  });

  it('ignores unknown events and older versions', async () => {
    fake = await FakeDecision.start({ config: withBanner(5, true) });
    const { client, logger } = createTestClient(fake.url);
    await client.ready();

    fake.broadcast('event: hello\ndata: {}\n\n');
    fake.broadcast(formatEvent({ event: 'config', data: withBanner(4, false) }));
    await eventually(() => {
      expect(logger.at('warn', 'older configuration ignored')).toHaveLength(1);
    });
    expect(logger.at('debug', 'unknown stream event ignored')).toHaveLength(1);
    expect(client.getFlag('new-banner', brUser, false)).toBe(true);
  });
});
