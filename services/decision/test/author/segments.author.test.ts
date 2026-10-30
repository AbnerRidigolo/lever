import type { SegmentCondition, SegmentConfig, UserContext } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { evaluateExperiment, evaluateFlag, matchesSegment } from '../../src/evaluation/index.js';
import { booleanFlag, brMobile, experiment, segmentsWith } from './fixtures.js';

function user(attributes: UserContext['attributes'], id = 'user-1'): UserContext {
  return { id, attributes };
}

function single(condition: SegmentCondition): SegmentConfig {
  return { key: 'single', rules: { conditions: [condition] } };
}

describe('matchesSegment', () => {
  it('AC-4.1: matches `country = BR` and `device in [mobile]` only when both hold', () => {
    expect(matchesSegment(brMobile, user({ country: 'BR', device: 'mobile' }))).toBe(true);
    expect(matchesSegment(brMobile, user({ country: 'BR', device: 'desktop' }))).toBe(false);
    expect(matchesSegment(brMobile, user({ country: 'US', device: 'mobile' }))).toBe(false);
  });

  it.each<[string, SegmentCondition, UserContext['attributes'], boolean]>([
    ['equals', { attribute: 'country', operator: 'equals', value: 'BR' }, { country: 'BR' }, true],
    ['equals', { attribute: 'country', operator: 'equals', value: 'BR' }, { country: 'AR' }, false],
    [
      'equals (boolean)',
      { attribute: 'beta', operator: 'equals', value: true },
      { beta: true },
      true,
    ],
    [
      'not_equals',
      { attribute: 'country', operator: 'not_equals', value: 'BR' },
      { country: 'AR' },
      true,
    ],
    [
      'not_equals',
      { attribute: 'country', operator: 'not_equals', value: 'BR' },
      { country: 'BR' },
      false,
    ],
    ['in', { attribute: 'plan', operator: 'in', value: ['pro', 'team'] }, { plan: 'team' }, true],
    ['in', { attribute: 'plan', operator: 'in', value: ['pro', 'team'] }, { plan: 'free' }, false],
    ['not_in', { attribute: 'plan', operator: 'not_in', value: ['free'] }, { plan: 'pro' }, true],
    ['not_in', { attribute: 'plan', operator: 'not_in', value: ['free'] }, { plan: 'free' }, false],
    ['greater_than', { attribute: 'age', operator: 'greater_than', value: 18 }, { age: 30 }, true],
    ['greater_than', { attribute: 'age', operator: 'greater_than', value: 18 }, { age: 18 }, false],
    ['less_than', { attribute: 'cart', operator: 'less_than', value: 100 }, { cart: 99.9 }, true],
    ['less_than', { attribute: 'cart', operator: 'less_than', value: 100 }, { cart: 100 }, false],
    // Interpretation to confirm: `contains` checks a substring of a string attribute...
    [
      'contains (string)',
      { attribute: 'email', operator: 'contains', value: '@example.com' },
      { email: 'ana@example.com' },
      true,
    ],
    [
      'contains (string)',
      { attribute: 'email', operator: 'contains', value: '@example.com' },
      { email: 'ana@lever.local' },
      false,
    ],
    // ...or an element of a string[] attribute.
    [
      'contains (list)',
      { attribute: 'tags', operator: 'contains', value: 'vip' },
      { tags: ['new', 'vip'] },
      true,
    ],
    [
      'contains (list)',
      { attribute: 'tags', operator: 'contains', value: 'vip' },
      { tags: ['new'] },
      false,
    ],
  ])('AC-4.2: %s', (_operator, condition, attributes, expected) => {
    expect(matchesSegment(single(condition), user(attributes))).toBe(expected);
  });

  it.each<SegmentCondition>([
    { attribute: 'country', operator: 'equals', value: 'BR' },
    { attribute: 'country', operator: 'not_equals', value: 'BR' },
    { attribute: 'country', operator: 'in', value: ['BR'] },
    { attribute: 'country', operator: 'not_in', value: ['BR'] },
    { attribute: 'age', operator: 'greater_than', value: 0 },
    { attribute: 'age', operator: 'less_than', value: 1_000 },
    { attribute: 'email', operator: 'contains', value: '@' },
  ])('AC-4.4: a missing attribute never matches ($operator)', (condition) => {
    expect(matchesSegment(single(condition), user({ unrelated: 'x' }))).toBe(false);
  });
});

describe('segment targeting', () => {
  const segments = segmentsWith(brMobile);
  const inside = user({ country: 'BR', device: 'mobile' });
  const outside = user({ country: 'US', device: 'mobile' });

  it('AC-4.3: a user outside the segment gets the flag default value', () => {
    const flag = booleanFlag({ segmentKey: 'br-mobile', rolloutBps: 10_000 });
    expect(evaluateFlag(flag, inside, segments)).toBe(true);
    expect(evaluateFlag(flag, outside, segments)).toBe(false);
  });

  it('AC-4.3: a user outside the segment gets the control variant', () => {
    const targeted = experiment({ segmentKey: 'br-mobile' });
    const outsiders = Array.from({ length: 1_000 }, (_, index) =>
      user({ country: 'US', device: 'desktop' }, `outsider-${index}`),
    );
    for (const outsider of outsiders) {
      expect(evaluateExperiment(targeted, outsider, segments)).toBe('one-page');
    }

    const insiders = Array.from({ length: 1_000 }, (_, index) =>
      user({ country: 'BR', device: 'mobile' }, `insider-${index}`),
    );
    const variants = new Set(
      insiders.map((insider) => evaluateExperiment(targeted, insider, segments)),
    );
    expect(variants).toEqual(new Set(['one-page', 'multi-step']));
  });

  it('AC-4.4: a user without the targeted attributes gets the default value', () => {
    const flag = booleanFlag({ segmentKey: 'br-mobile' });
    expect(evaluateFlag(flag, user({}), segments)).toBe(false);
  });
});
