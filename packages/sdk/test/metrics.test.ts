import { afterEach, describe, expect, it } from 'vitest';

import type { Evaluator } from '../src/evaluator.js';
import { createTestClient, fakeEvaluator } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig } from './fixtures.js';
import { eventually } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

function clock(start: number): { now: () => number; advance: (ms: number) => void } {
  let time = start;
  return {
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
  };
}

describe('client metrics (spec 001 section 10, D11)', () => {
  it('starts without config, version or age', async () => {
    fake = await FakeDecision.start({ config: null });
    const { client } = createTestClient(fake.url);
    expect(client.getMetrics()).toMatchObject({
      flagEvaluations: 0,
      experimentEvaluations: 0,
      evaluationErrors: 0,
      invalidMessages: 0,
      configVersion: null,
      configAgeMs: null,
    });
    await eventually(() => {
      expect(client.getMetrics().reconnects).toBeGreaterThanOrEqual(1);
    });
    expect(['connecting', 'disconnected']).toContain(client.getMetrics().connection);
  });

  it('counts evaluations, errors and invalid messages', async () => {
    fake = await FakeDecision.start({ config: testConfig(2) });
    const failing: Evaluator = {
      ...fakeEvaluator,
      evaluateExperiment: () => {
        throw new Error('not implemented: reserved for author');
      },
    };
    const { client } = createTestClient(fake.url, {}, { evaluator: failing });
    await client.ready();

    client.getFlag('new-banner', brUser, false);
    client.getFlag('missing', brUser, false);
    client.getVariant('checkout-layout', brUser);
    client.getVariant('checkout-layout', brUser);
    client.getVariant('checkout-layout', brUser);
    fake.broadcast('event: config\ndata: {}\n\n');

    await eventually(() => {
      expect(client.getMetrics().invalidMessages).toBe(1);
    });
    expect(client.getMetrics()).toMatchObject({
      flagEvaluations: 2,
      experimentEvaluations: 3,
      evaluationErrors: 3,
      configVersion: 2,
      connection: 'connected',
    });
  });

  it('measures the config age since the last config or ping, and counts reconnects', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const time = clock(1_000_000);
    const { client } = createTestClient(fake.url, {}, { now: time.now });
    await client.ready();
    expect(client.getMetrics().configAgeMs).toBe(0);

    time.advance(10_000);
    expect(client.getMetrics().configAgeMs).toBe(10_000);

    fake.ping();
    await eventually(() => {
      expect(client.getMetrics().configAgeMs).toBe(0);
    });

    time.advance(3_000);
    fake.dropStreams();
    await eventually(() => {
      expect(client.getMetrics().reconnects).toBe(1);
    });
    // The reconnection delivered the same version again, which confirms it is current.
    await eventually(() => {
      expect(client.getMetrics().configAgeMs).toBe(0);
    });
    expect(client.getMetrics().configVersion).toBe(1);
  });

  it('reports the closed and unauthorized connection states', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.failWith = 401;
    const { client } = createTestClient(fake.url);
    await eventually(() => {
      expect(client.getMetrics().connection).toBe('unauthorized');
    });
    await client.close();
    expect(client.getMetrics().connection).toBe('closed');
  });
});
