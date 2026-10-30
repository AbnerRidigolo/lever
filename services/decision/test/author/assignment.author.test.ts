import { describe, expect, it } from 'vitest';

import { assignVariant, bucketOf } from '../../src/assignment/index.js';
import { evaluateExperiment, evaluateFlag } from '../../src/evaluation/index.js';
import {
  booleanFlag,
  experiment,
  NO_SEGMENTS,
  SAMPLE_SIZE,
  share,
  syntheticUsers,
} from './fixtures.js';

const users = syntheticUsers();

describe('bucketOf', () => {
  it('FR-004: returns an integer bucket from 0 to 9,999', () => {
    for (const user of users.slice(0, 10_000)) {
      const bucket = bucketOf('new-banner', 'salt-new-banner', user.id);
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(9_999);
    }
  });

  it('FR-004: depends only on the resource key, its salt and the user id', () => {
    expect(bucketOf('new-banner', 'salt-a', 'user-1')).toBe(
      bucketOf('new-banner', 'salt-a', 'user-1'),
    );

    const changedBySalt = users
      .slice(0, 1_000)
      .filter(
        (user) =>
          bucketOf('new-banner', 'salt-a', user.id) !== bucketOf('new-banner', 'salt-b', user.id),
      );
    expect(changedBySalt.length).toBeGreaterThan(900);

    const changedByKey = users
      .slice(0, 1_000)
      .filter(
        (user) => bucketOf('flag-a', 'salt-a', user.id) !== bucketOf('flag-b', 'salt-a', user.id),
      );
    expect(changedByKey.length).toBeGreaterThan(900);
  });
});

describe('rollout', () => {
  it('AC-2.1: a 10% rollout turns the flag on for 9.5% to 10.5% of 100,000 synthetic ids', () => {
    const flag = booleanFlag({ rolloutBps: 1_000 });
    const on = users.filter((user) => evaluateFlag(flag, user, NO_SEGMENTS) === true).length;
    expect(share(on, SAMPLE_SIZE)).toBeGreaterThanOrEqual(0.095);
    expect(share(on, SAMPLE_SIZE)).toBeLessThanOrEqual(0.105);
  });

  it('AC-2.2: raising the rollout from 10% to 50% keeps everyone who already had the flag', () => {
    const at10 = booleanFlag({ rolloutBps: 1_000 });
    const at50 = booleanFlag({ rolloutBps: 5_000 });
    const lost = users.filter(
      (user) =>
        evaluateFlag(at10, user, NO_SEGMENTS) === true &&
        evaluateFlag(at50, user, NO_SEGMENTS) !== true,
    );
    expect(lost).toEqual([]);

    const on50 = users.filter((user) => evaluateFlag(at50, user, NO_SEGMENTS) === true).length;
    expect(share(on50, SAMPLE_SIZE)).toBeGreaterThanOrEqual(0.495);
    expect(share(on50, SAMPLE_SIZE)).toBeLessThanOrEqual(0.505);
  });

  it('AC-2.3: the same user gets the same result for the same configuration, in any instance', () => {
    const flag = booleanFlag({ rolloutBps: 3_000 });
    // A deep copy stands in for the configuration as received by another instance or the SDK.
    const copy = structuredClone(flag);
    for (const user of users.slice(0, 10_000)) {
      const first = evaluateFlag(flag, user, NO_SEGMENTS);
      expect(evaluateFlag(flag, user, NO_SEGMENTS)).toBe(first);
      expect(evaluateFlag(copy, structuredClone(user), new Map())).toBe(first);
    }
  });

  it('serves the default value to everyone with a 0% rollout or a disabled flag', () => {
    const zero = booleanFlag({ rolloutBps: 0 });
    const disabled = booleanFlag({ enabled: false, rolloutBps: 10_000 });
    for (const user of users.slice(0, 10_000)) {
      expect(evaluateFlag(zero, user, NO_SEGMENTS)).toBe(false);
      expect(evaluateFlag(disabled, user, NO_SEGMENTS)).toBe(false);
    }
  });

  it('serves the served value to everyone with a 100% rollout', () => {
    const full = booleanFlag({ rolloutBps: 10_000 });
    for (const user of users.slice(0, 10_000)) {
      expect(evaluateFlag(full, user, NO_SEGMENTS)).toBe(true);
    }
  });
});

describe('experiment assignment', () => {
  it('AC-3.2: a 50/50 experiment puts 49.5% to 50.5% of 100,000 synthetic ids in each variant', () => {
    const fiftyFifty = experiment();
    const counts = new Map<string, number>();
    for (const user of users) {
      const variant = assignVariant(fiftyFifty, user.id);
      counts.set(variant, (counts.get(variant) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(['multi-step', 'one-page']);
    for (const count of counts.values()) {
      expect(share(count, SAMPLE_SIZE)).toBeGreaterThanOrEqual(0.495);
      expect(share(count, SAMPLE_SIZE)).toBeLessThanOrEqual(0.505);
    }
  });

  it('AC-3.2: follows uneven weights too (20/30/50)', () => {
    const uneven = experiment({
      variants: [
        { key: 'control', weightBps: 2_000, isControl: true },
        { key: 'b', weightBps: 3_000, isControl: false },
        { key: 'c', weightBps: 5_000, isControl: false },
      ],
    });
    const counts = new Map<string, number>();
    for (const user of users) {
      const variant = assignVariant(uneven, user.id);
      counts.set(variant, (counts.get(variant) ?? 0) + 1);
    }
    expect(share(counts.get('control') ?? 0, SAMPLE_SIZE)).toBeCloseTo(0.2, 2);
    expect(share(counts.get('b') ?? 0, SAMPLE_SIZE)).toBeCloseTo(0.3, 2);
    expect(share(counts.get('c') ?? 0, SAMPLE_SIZE)).toBeCloseTo(0.5, 2);
  });

  it('AC-3.3: a user stays in the same variant while the experiment is running', () => {
    const running = experiment();
    for (const user of users.slice(0, 10_000)) {
      const first = evaluateExperiment(running, user, NO_SEGMENTS);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(evaluateExperiment(structuredClone(running), user, NO_SEGMENTS)).toBe(first);
      }
    }
  });

  it('AC-3.4: being in variant B of experiment X does not change the chance of B in Y', () => {
    const x = experiment({ key: 'experiment-x', salt: 'salt-x' });
    const y = experiment({ key: 'experiment-y', salt: 'salt-y' });
    const inBofX = users.filter((user) => assignVariant(x, user.id) === 'multi-step');
    const alsoBofY = inBofX.filter((user) => assignVariant(y, user.id) === 'multi-step');

    // About 50,000 users: a ±1 percentage point band is more than 4 standard deviations.
    expect(share(alsoBofY.length, inBofX.length)).toBeGreaterThanOrEqual(0.49);
    expect(share(alsoBofY.length, inBofX.length)).toBeLessThanOrEqual(0.51);
  });

  it.each(['draft', 'paused', 'completed'] as const)(
    'AC-3.5: a %s experiment gives everyone the control variant',
    (status) => {
      const stopped = experiment({}, status);
      for (const user of users.slice(0, 10_000)) {
        expect(evaluateExperiment(stopped, user, NO_SEGMENTS)).toBe('one-page');
      }
    },
  );

  it('AC-3.5: only a running experiment assigns other variants', () => {
    const running = experiment();
    const variants = new Set(
      users.slice(0, 1_000).map((user) => evaluateExperiment(running, user, NO_SEGMENTS)),
    );
    expect(variants).toEqual(new Set(['one-page', 'multi-step']));
  });
});
