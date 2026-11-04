import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig } from './fixtures.js';

let fake: FakeDecision;
beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(1) });
});
afterAll(async () => {
  await fake.stop();
});

describe('local evaluation (AC-5.3)', () => {
  it('AC-5.3: after ready, 10,000 evaluations make no request to the decision service', async () => {
    const { client } = createTestClient(fake.url);
    expect(await client.ready()).toBe('ready');
    const requestsBefore = fake.requests.length;
    expect(requestsBefore).toBe(1);

    for (let index = 0; index < 5_000; index += 1) {
      const user = { ...brUser, id: `user-${index}` };
      client.getFlag('new-banner', user, false);
      client.getVariant('checkout-layout', user);
    }

    expect(fake.requests.length).toBe(requestsBefore);
    expect(fake.requests.every((request) => request.path === '/v1/stream')).toBe(true);
  });
});
