import { apiErrorSchema, evaluateResponseSchema } from '@lever/schemas';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Evaluator } from '../src/evaluator.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  fakeEvaluator,
  seededEnvironmentId,
  useTestDb,
} from './helpers.js';

const db = useTestDb();
const calls: { kind: 'flag' | 'experiment'; key: string; userId: string; segments: number }[] = [];
const recordingEvaluator: Evaluator = {
  evaluateFlag: (flag, user, segments) => {
    calls.push({ kind: 'flag', key: flag.key, userId: user.id, segments: segments.size });
    return fakeEvaluator.evaluateFlag(flag, user, segments);
  },
  evaluateExperiment: (experiment, user, segments) => {
    calls.push({
      kind: 'experiment',
      key: experiment.key,
      userId: user.id,
      segments: segments.size,
    });
    return fakeEvaluator.evaluateExperiment(experiment, user, segments);
  },
};
const { app } = createTestApp(db, { evaluator: recordingEvaluator });
const { app: crashingApp } = createTestApp(db, {
  evaluator: {
    evaluateFlag: () => {
      throw new Error('not implemented: reserved for author');
    },
    evaluateExperiment: () => {
      throw new Error('not implemented: reserved for author');
    },
  },
});

let devKey: string;
const user = { id: 'anon-42', attributes: { country: 'BR', device: 'mobile' } };

beforeAll(async () => {
  devKey = (await createApiKey(db, await seededEnvironmentId(db, 'development'), 'development'))
    .key;
});

function evaluate(payload: object | undefined, key = devKey, target = app) {
  return target.inject({
    method: 'POST',
    url: '/v1/evaluate',
    headers: bearer(key),
    ...(payload === undefined ? {} : { payload }),
  });
}

describe('POST /v1/evaluate', () => {
  it('FR-007: evaluates every flag and experiment through the evaluator', async () => {
    calls.length = 0;
    const response = await evaluate({ user });
    expect(response.statusCode).toBe(200);

    const body = evaluateResponseSchema.parse(response.json());
    expect(body.flags['new-banner']).toBe(false);
    expect(body.experiments['checkout-layout']).toBe('one-page');
    expect(body.version).toBeGreaterThanOrEqual(1);
    expect(calls.every((call) => call.userId === 'anon-42')).toBe(true);
    expect(calls.some((call) => call.kind === 'flag' && call.key === 'new-banner')).toBe(true);
  });

  it('FR-007: evaluates only the requested keys and leaves unknown keys out', async () => {
    calls.length = 0;
    const response = await evaluate({
      user,
      flags: ['new-banner', 'does-not-exist'],
      experiments: [],
    });
    const body = evaluateResponseSchema.parse(response.json());
    expect(body.flags).toEqual({ 'new-banner': false });
    expect(body.experiments).toEqual({});
    expect(calls).toEqual([{ kind: 'flag', key: 'new-banner', userId: 'anon-42', segments: 0 }]);
  });

  it.each([
    ['no body', undefined],
    ['no user', { flags: ['new-banner'] }],
    ['a user without id', { user: { attributes: {} } }],
    ['nested attributes', { user: { id: 'a', attributes: { address: { city: 'X' } } } }],
    ['an invalid key', { user, flags: ['Not A Key'] }],
  ])('FR-007: rejects %s with 422 and details', async (_case, payload) => {
    const response = await evaluate(payload);
    expect(response.statusCode).toBe(422);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.length).toBeGreaterThan(0);
  });

  it('FR-007: requires an API key', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/evaluate', payload: { user } });
    expect(response.statusCode).toBe(401);
  });

  it('returns a standard 500 when the evaluator fails, without leaking the message', async () => {
    const response = await evaluate({ user }, devKey, crashingApp);
    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(response.json()).error.message).toBe('Internal server error');
  });
});
