import { exposureEventSchema, type ExposureEvent } from '@lever/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Evaluator } from '../src/evaluator.js';
import { createTestClient, fakeEvaluator } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig, usUser } from './fixtures.js';

let fake: FakeDecision;
beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(3) });
});
afterAll(async () => {
  await fake.stop();
});

/** Fake evaluator whose segment check follows the `country = BR` segment of the fixture. */
const brazilOnly: Evaluator = {
  ...fakeEvaluator,
  matchesSegment: (_segment, user) => user.attributes.country === 'BR',
};

async function readyClient(evaluator: Evaluator = brazilOnly, now = () => Date.UTC(2026, 10, 3)) {
  const test = createTestClient(fake.url, {}, { evaluator, now });
  expect(await test.client.ready()).toBe('ready');
  const events: ExposureEvent[] = [];
  test.client.onExposure((event) => events.push(event));
  return { ...test, events };
}

describe('exposure hook (AC-5.7, D10)', () => {
  it('AC-5.7: calls the hook on every assignment of a running experiment with a valid event', async () => {
    const { client, events } = await readyClient();
    client.getVariant('checkout-layout', brUser);
    client.getVariant('checkout-layout', brUser);

    expect(events).toHaveLength(2);
    for (const event of events) expect(exposureEventSchema.parse(event)).toEqual(event);
    expect(events[0]).toEqual({
      type: 'exposure',
      experimentKey: 'checkout-layout',
      variantKey: 'one-page',
      userId: brUser.id,
      configVersion: 3,
      timestamp: '2026-11-03T00:00:00.000Z',
    });
  });

  it('only exposes users inside the experiment segment', async () => {
    const { client, events } = await readyClient();
    expect(client.getVariant('br-checkout', usUser)).toBe('one-page');
    expect(events).toHaveLength(0);
    client.getVariant('br-checkout', brUser);
    expect(events.map((event) => event.userId)).toEqual([brUser.id]);
  });

  it('does not expose experiments that are not running', async () => {
    const { client, events } = await readyClient();
    expect(client.getVariant('paused-test', brUser)).toBe('one-page');
    expect(events).toHaveLength(0);
  });

  it('does not expose without config, for unknown experiments or when evaluation fails', async () => {
    const failing: Evaluator = {
      ...brazilOnly,
      evaluateExperiment: () => {
        throw new Error('not implemented: reserved for author');
      },
    };
    const { client, events } = await readyClient(failing);
    client.getVariant('checkout-layout', brUser);
    client.getVariant('missing', brUser);
    expect(events).toHaveLength(0);

    await fake.stop();
    const offline = createTestClient(fake.url);
    const offlineEvents: ExposureEvent[] = [];
    offline.client.onExposure((event) => offlineEvents.push(event));
    expect(offline.client.getVariant('checkout-layout', brUser)).toBeNull();
    expect(offlineEvents).toHaveLength(0);
    await fake.restart();
  });

  it('a failing segment check returns the variant without exposure and logs once', async () => {
    const failing: Evaluator = {
      ...fakeEvaluator,
      matchesSegment: () => {
        throw new Error('not implemented: reserved for author');
      },
    };
    const { client, events, logger } = await readyClient(failing);
    expect(client.getVariant('br-checkout', brUser)).toBe('one-page');
    expect(client.getVariant('br-checkout', brUser)).toBe('one-page');
    expect(events).toHaveLength(0);
    expect(logger.at('error')).toHaveLength(1);
    expect(logger.at('error')[0]?.fields).toMatchObject({ segmentKey: 'brazil' });
  });

  it('isolates a listener that throws and keeps calling the others', async () => {
    const { client, events, logger } = await readyClient();
    client.onExposure(() => {
      throw new Error('listener bug');
    });
    const later: ExposureEvent[] = [];
    client.onExposure((event) => later.push(event));

    expect(client.getVariant('checkout-layout', brUser)).toBe('one-page');
    expect(events).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(logger.at('error', 'exposure listener failed')).toHaveLength(1);
  });

  it('removes a listener and, without listeners, logs at debug without the user id', async () => {
    const { client, logger } = createTestClient(fake.url, {}, { evaluator: brazilOnly });
    await client.ready();
    const events: ExposureEvent[] = [];
    const remove = client.onExposure((event) => events.push(event));
    remove();

    client.getVariant('checkout-layout', brUser);
    expect(events).toHaveLength(0);
    const debug = logger.at('debug', 'exposure');
    expect(debug).toHaveLength(1);
    expect(debug[0]?.fields).toEqual({
      experimentKey: 'checkout-layout',
      variantKey: 'one-page',
      configVersion: 3,
    });
    expect(JSON.stringify(logger.entries)).not.toContain(brUser.id);
  });
});
