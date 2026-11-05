import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createClient, defaultDeps, type LeverClient } from '../src/client.js';
import { fakeEvaluator } from '../test/client-helpers.js';
import { FakeDecision } from '../test/fake-decision.js';
import { testConfig } from '../test/fixtures.js';
import { capturingLogger, TEST_API_KEY } from '../test/helpers.js';

// NFR-001 (sdk plan, D14): `pnpm --filter @lever/sdk bench` reports the latency of local
// evaluation. It uses the fake evaluator until the author implements @lever/evaluation, so it
// measures the cost of the SDK around the evaluation.
let fake: FakeDecision;
let client: LeverClient;

beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(1) });
  client = createClient(
    { apiKey: TEST_API_KEY, baseUrl: fake.url, logger: capturingLogger() },
    { ...defaultDeps, evaluator: fakeEvaluator },
  );
  await client.ready();
  client.onExposure(() => undefined);
});

afterAll(async () => {
  await client.close();
  await fake.stop();
});

let counter = 0;
function nextUser() {
  counter += 1;
  return { id: `user-${counter}`, attributes: { country: 'BR', device: 'mobile' } };
}

describe('local evaluation benchmark (NFR-001)', () => {
  it('NFR-001: p99 of getFlag and getVariant below 1 ms', async ({ bench }) => {
    const results = await bench.compare(
      bench('getFlag', () => {
        client.getFlag('new-banner', nextUser(), false);
      }),
      bench('getVariant (with exposure)', () => {
        client.getVariant('checkout-layout', nextUser());
      }),
    );
    for (const name of ['getFlag', 'getVariant (with exposure)'] as const) {
      const { latency } = results.get(name);
      console.info(
        `${name}: p99 = ${latency.p99.toFixed(5)} ms, mean = ${latency.mean.toFixed(5)} ms, samples = ${latency.samplesCount}`,
      );
      expect(latency.p99).toBeLessThan(1);
    }
  });
});
