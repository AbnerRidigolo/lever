import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { testConfig } from './fixtures.js';

let fake: FakeDecision;
beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(1) });
});
afterAll(async () => {
  await fake.stop();
});

const CALLS = 10_000;

function p99(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.99) - 1] ?? Number.POSITIVE_INFINITY;
}

function measure(call: (index: number) => void): number {
  for (let index = 0; index < 1_000; index += 1) call(index); // warm-up
  const samples: number[] = [];
  for (let index = 0; index < CALLS; index += 1) {
    const started = performance.now();
    call(index);
    samples.push(performance.now() - started);
  }
  return p99(samples);
}

/**
 * NFR-001 (partial, sdk plan D14): cost of the SDK around the evaluation (user validation, index
 * lookup, counters and exposure) with the fake evaluator. The number with the author's evaluation
 * comes from the author tests.
 */
describe('local evaluation latency (NFR-001)', () => {
  it('NFR-001: p99 of getFlag and getVariant stays below 1 ms over 10,000 calls', async () => {
    const { client } = createTestClient(fake.url);
    expect(await client.ready()).toBe('ready');
    client.onExposure(() => undefined);
    const user = (index: number) => ({
      id: `user-${index}`,
      attributes: { country: 'BR', device: 'mobile', plan: 'free' },
    });

    const flagP99 = measure((index) => client.getFlag('new-banner', user(index), false));
    const variantP99 = measure((index) => client.getVariant('checkout-layout', user(index)));
    console.info(
      `NFR-001 (fake evaluator): getFlag p99 = ${flagP99.toFixed(4)} ms, getVariant p99 = ${variantP99.toFixed(4)} ms`,
    );
    expect(flagP99).toBeLessThan(1);
    expect(variantP99).toBeLessThan(1);
  });
});
