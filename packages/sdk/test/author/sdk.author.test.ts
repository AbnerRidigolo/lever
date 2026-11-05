import type { ExposureEvent } from '@lever/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLeverClient, type LeverClient } from '../../src/index.js';
import { FakeDecision } from '../fake-decision.js';
import { brUser, testConfig, usUser } from '../fixtures.js';
import { capturingLogger, TEST_API_KEY, type CapturingLogger } from '../helpers.js';

// With the author's evaluation (the public client, no injected evaluator). These tests fail until
// @lever/evaluation is implemented, so they run with `pnpm --filter @lever/sdk test:author`
// (sdk plan, D13).
let fake: FakeDecision;
let client: LeverClient;
let logger: CapturingLogger;

beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(1) });
  logger = capturingLogger();
  client = createLeverClient({ apiKey: TEST_API_KEY, baseUrl: fake.url, logger });
  expect(await client.ready()).toBe('ready');
});

afterAll(async () => {
  await client.close();
  await fake.stop();
});

function users(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `author-user-${index}`,
    attributes: { country: index % 2 === 0 ? 'BR' : 'US' },
  }));
}

describe('SDK with the author evaluation', () => {
  it('AC-5.1: a flag on at 100% without segment serves its value to everyone', () => {
    for (const user of users(200)) {
      expect(client.getFlag('new-banner', user, false)).toBe(true);
      expect(client.getFlag('headline', user, 'Hi')).toBe('Hello');
    }
    expect(logger.at('error')).toHaveLength(0);
  });

  it('AC-5.1 / AC-4.3: a flag restricted to a segment serves the default outside it', () => {
    expect(client.getFlag('theme', brUser, { color: 'red' })).toEqual({ color: 'green' });
    expect(client.getFlag('theme', usUser, { color: 'red' })).toEqual({ color: 'blue' });
  });

  it('AC-5.2: returns a variant key of the experiment, stable for the same user', () => {
    const seen = new Set<string>();
    for (const user of users(500)) {
      const variant = client.getVariant('checkout-layout', user);
      expect(['one-page', 'multi-step']).toContain(variant);
      expect(client.getVariant('checkout-layout', user)).toBe(variant);
      seen.add(variant ?? '');
    }
    expect(seen.size).toBe(2);
  });

  it('AC-5.2 / AC-3.5: a paused experiment gives everyone the control variant', () => {
    for (const user of users(100)) expect(client.getVariant('paused-test', user)).toBe('one-page');
  });

  it('AC-5.7: exposures only for running experiments and users inside the segment', () => {
    const events: ExposureEvent[] = [];
    const remove = client.onExposure((event) => events.push(event));
    client.getVariant('br-checkout', brUser);
    client.getVariant('br-checkout', usUser);
    client.getVariant('paused-test', brUser);
    client.getVariant('checkout-layout', usUser);
    remove();
    expect(events.map((event) => [event.experimentKey, event.userId])).toEqual([
      ['br-checkout', brUser.id],
      ['checkout-layout', usUser.id],
    ]);
  });

  it('NFR-001: p99 of local evaluation below 1 ms with the real evaluation', () => {
    const samples: number[] = [];
    const all = users(10_000);
    for (const user of all.slice(0, 1_000)) client.getFlag('new-banner', user, false);
    for (const user of all) {
      const started = performance.now();
      client.getFlag('theme', user, { color: 'red' });
      client.getVariant('br-checkout', user);
      samples.push((performance.now() - started) / 2);
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.ceil(samples.length * 0.99) - 1] ?? Number.POSITIVE_INFINITY;
    console.info(`NFR-001 (author evaluation): p99 = ${p99.toFixed(4)} ms`);
    expect(p99).toBeLessThan(1);
  });
});
