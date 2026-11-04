import * as evaluation from '@lever/evaluation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLeverClient, defaultDeps } from '../src/client.js';
import { defaultEvaluator, type Evaluator } from '../src/evaluator.js';
import * as publicApi from '../src/index.js';
import { createTestClient, fakeEvaluator } from './client-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { brUser, testConfig, usUser } from './fixtures.js';
import { TEST_API_KEY } from './helpers.js';

let fake: FakeDecision;
beforeAll(async () => {
  fake = await FakeDecision.start({ config: testConfig(1) });
});
afterAll(async () => {
  await fake.stop();
});

async function readyClient(evaluator: Evaluator = fakeEvaluator) {
  const test = createTestClient(fake.url, {}, { evaluator });
  expect(await test.client.ready()).toBe('ready');
  return test;
}

describe('getFlag (AC-5.1, D7)', () => {
  it('AC-5.1: returns the flag value for every flag type', async () => {
    const { client } = await readyClient();
    const banner: boolean = client.getFlag('new-banner', brUser, false);
    const headline: string = client.getFlag('headline', brUser, 'Hi');
    const maxItems: number = client.getFlag('max-items', brUser, 1);
    const theme = client.getFlag('theme', brUser, { color: 'red' });
    expect([banner, headline, maxItems, theme]).toEqual([true, 'Hello', 7, { color: 'green' }]);
  });

  it('AC-5.1: returns the default for an unknown flag, warning once per key', async () => {
    const { client, logger } = await readyClient();
    expect(client.getFlag('missing', brUser, false)).toBe(false);
    expect(client.getFlag('missing', usUser, true)).toBe(true);
    expect(logger.at('warn', 'unknown flag; serving the default value')).toHaveLength(1);
  });

  it('returns the default when its type does not match the flag type', async () => {
    const { client, logger } = await readyClient();
    expect(client.getFlag('new-banner', brUser, 'yes')).toBe('yes');
    expect(client.getFlag('headline', brUser, 0)).toBe(0);
    expect(client.getFlag('theme', brUser, true)).toBe(true);
    expect(logger.at('warn')[0]?.fields).toEqual({ flagKey: 'new-banner', flagType: 'boolean' });
  });

  it('returns the default for an invalid user context, without logging it', async () => {
    const { client, logger } = await readyClient();
    const invalid = { id: '', attributes: { email: 'person@example.test' } };
    expect(client.getFlag('new-banner', invalid, false)).toBe(false);
    expect(client.getVariant('checkout-layout', invalid)).toBeNull();
    expect(JSON.stringify(logger.entries)).not.toContain('person@example.test');
  });

  it('never throws: an evaluator error serves the default and is logged once per key', async () => {
    const failing: Evaluator = {
      ...fakeEvaluator,
      evaluateFlag: () => {
        throw new Error('not implemented: reserved for author');
      },
    };
    const { client, logger } = await readyClient(failing);
    expect(client.getFlag('new-banner', brUser, false)).toBe(false);
    expect(client.getFlag('new-banner', usUser, false)).toBe(false);
    const errors = logger.at('error', 'evaluation failed; serving the default value');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fields).toMatchObject({ flagKey: 'new-banner' });
  });

  it('serves the default when the evaluator returns a value of another type', async () => {
    const wrongType: Evaluator = { ...fakeEvaluator, evaluateFlag: () => 'not a boolean' };
    const { client, logger } = await readyClient(wrongType);
    expect(client.getFlag('new-banner', brUser, false)).toBe(false);
    expect(logger.at('error')).toHaveLength(1);
  });
});

describe('getVariant (AC-5.2, D6)', () => {
  it('AC-5.2: returns the variant key chosen by the evaluator', async () => {
    const { client } = await readyClient();
    expect(client.getVariant('checkout-layout', brUser)).toBe('one-page');
  });

  it('passes the user and the segments to the evaluator', async () => {
    const calls: unknown[] = [];
    const recording: Evaluator = {
      ...fakeEvaluator,
      evaluateExperiment: (experiment, user, segments) => {
        calls.push([experiment.key, user.id, [...segments.keys()]]);
        return 'multi-step';
      },
    };
    const { client } = await readyClient(recording);
    expect(client.getVariant('br-checkout', brUser)).toBe('multi-step');
    expect(calls).toEqual([['br-checkout', brUser.id, ['brazil']]]);
  });

  it('returns null for an unknown experiment, warning once', async () => {
    const { client, logger } = await readyClient();
    expect(client.getVariant('missing', brUser)).toBeNull();
    expect(client.getVariant('missing', brUser)).toBeNull();
    expect(logger.at('warn', 'unknown experiment')).toHaveLength(1);
  });

  it('returns null when the evaluator throws', async () => {
    const failing: Evaluator = {
      ...fakeEvaluator,
      evaluateExperiment: () => {
        throw new Error('not implemented: reserved for author');
      },
    };
    const { client, logger } = await readyClient(failing);
    expect(client.getVariant('checkout-layout', brUser)).toBeNull();
    expect(logger.at('error')[0]?.fields).toMatchObject({ experimentKey: 'checkout-layout' });
  });
});

describe('public client (D13)', () => {
  it('uses the evaluation of @lever/evaluation by default', () => {
    expect(defaultDeps.evaluator).toBe(defaultEvaluator);
    expect(defaultEvaluator.evaluateFlag).toBe(evaluation.evaluateFlag);
    expect(defaultEvaluator.evaluateExperiment).toBe(evaluation.evaluateExperiment);
    expect(defaultEvaluator.matchesSegment).toBe(evaluation.matchesSegment);
  });

  it('exports only createLeverClient at runtime, never the internal factory', () => {
    expect(Object.keys(publicApi)).toEqual(['createLeverClient']);
  });

  it('createLeverClient validates the options', () => {
    expect(() => createLeverClient({ apiKey: 'nope', baseUrl: fake.url })).toThrow(TypeError);
  });

  it('createLeverClient connects with the real evaluator and never throws on evaluation', async () => {
    const client = createLeverClient({
      apiKey: TEST_API_KEY,
      baseUrl: fake.url,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });
    try {
      expect(await client.ready()).toBe('ready');
      // The author's evaluation still throws `not implemented`, so the defaults are served.
      // When it is implemented, this still holds for an unknown flag.
      expect(client.getFlag('unknown-flag', brUser, false)).toBe(false);
    } finally {
      await client.close();
    }
  });
});
