import type { SegmentCondition, SegmentConfig } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { assignVariant, bucketOf } from '../src/assignment.js';
import { evaluateExperiment, evaluateFlag, matchesSegment } from '../src/evaluation.js';
import { booleanFlag, experiment, NO_SEGMENTS } from './author/fixtures.js';

const user = { id: 'synthetic-boundary', attributes: {} };

describe('evaluation boundaries', () => {
  it('AC-2.2: the rollout boundary excludes its bucket and includes the next basis point', () => {
    const flag = booleanFlag();
    const bucket = bucketOf(flag.key, flag.salt, user.id);
    expect(evaluateFlag({ ...flag, rolloutBps: bucket }, user, NO_SEGMENTS)).toBe(false);
    expect(evaluateFlag({ ...flag, rolloutBps: bucket + 1 }, user, NO_SEGMENTS)).toBe(true);
  });

  it('AC-3.2: zero-weight variants never receive a user', () => {
    const config = experiment({
      variants: [
        { key: 'control', weightBps: 0, isControl: true },
        { key: 'active', weightBps: 10_000, isControl: false },
      ],
    });
    for (let index = 0; index < 1_000; index += 1) {
      expect(assignVariant(config, `zero-weight-${index}`)).toBe('active');
    }
  });

  it('AC-4.3: a missing segment fails closed', () => {
    expect(evaluateFlag(booleanFlag({ segmentKey: 'missing' }), user, NO_SEGMENTS)).toBe(false);
    expect(evaluateExperiment(experiment({ segmentKey: 'missing' }), user, NO_SEGMENTS)).toBe(
      'one-page',
    );
  });

  it.each<SegmentCondition>([
    { attribute: 'value', operator: 'equals', value: 18 },
    { attribute: 'value', operator: 'not_equals', value: 18 },
    { attribute: 'value', operator: 'greater_than', value: 17 },
    { attribute: 'value', operator: 'less_than', value: 19 },
    { attribute: 'value', operator: 'in', value: [18] },
  ])('AC-4.2: $operator does not coerce strings to numbers', (condition) => {
    const segment: SegmentConfig = { key: 'typed', rules: { conditions: [condition] } };
    expect(matchesSegment(segment, { id: user.id, attributes: { value: '18' } })).toBe(false);
  });

  it('AC-4.4: inherited attributes never match even negative conditions', () => {
    const segment: SegmentConfig = {
      key: 'own-only',
      rules: {
        conditions: [{ attribute: 'constructor', operator: 'not_equals', value: 'anything' }],
      },
    };
    expect(matchesSegment(segment, user)).toBe(false);
  });

  it('FR-004: tuple boundaries remain distinct for identifiers containing separators', () => {
    expect(bucketOf('a:b', 'c', 'd')).not.toBe(bucketOf('a', 'b:c', 'd'));
    expect(bucketOf('banner', 'salt', 'usuário-😀')).toBe(5166);
    expect(bucketOf('new-banner', 'salt-new-banner', 'user-1')).toBe(9614);
  });
});
