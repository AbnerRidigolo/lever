import { describe, expect, it } from 'vitest';

import {
  SEGMENT_OPERATORS,
  segmentConditionSchema,
  segmentDefinitionSchema,
  segmentRulesSchema,
} from './segment.js';

describe('segmentRulesSchema', () => {
  it('AC-4.1 (contract): accepts `country = BR` and `device in [mobile]`', () => {
    const rules = {
      conditions: [
        { attribute: 'country', operator: 'equals', value: 'BR' },
        { attribute: 'device', operator: 'in', value: ['mobile'] },
      ],
    };
    expect(segmentRulesSchema.parse(rules)).toEqual(rules);
  });

  it('requires at least one condition', () => {
    expect(segmentRulesSchema.safeParse({ conditions: [] }).success).toBe(false);
  });

  it('rejects unknown fields, so stored rules stay well defined', () => {
    expect(
      segmentRulesSchema.safeParse({
        conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }],
        combinator: 'or',
      }).success,
    ).toBe(false);
  });
});

describe('segmentConditionSchema', () => {
  it('AC-4.2 (contract): supports exactly the seven operators', () => {
    expect(SEGMENT_OPERATORS).toEqual([
      'equals',
      'not_equals',
      'in',
      'not_in',
      'greater_than',
      'less_than',
      'contains',
    ]);
  });

  it.each([
    { attribute: 'country', operator: 'equals', value: 'BR' },
    { attribute: 'beta', operator: 'equals', value: true },
    { attribute: 'country', operator: 'not_equals', value: 'US' },
    { attribute: 'device', operator: 'in', value: ['mobile', 'tablet'] },
    { attribute: 'plan', operator: 'not_in', value: ['free'] },
    { attribute: 'age', operator: 'greater_than', value: 18 },
    { attribute: 'cart_total', operator: 'less_than', value: 99.9 },
    { attribute: 'email', operator: 'contains', value: '@example.com' },
  ])('AC-4.2 (contract): accepts $operator with a matching value', (condition) => {
    expect(segmentConditionSchema.safeParse(condition).success).toBe(true);
  });

  it.each([
    { attribute: 'device', operator: 'in', value: 'mobile' },
    { attribute: 'device', operator: 'in', value: [] },
    { attribute: 'age', operator: 'greater_than', value: '18' },
    { attribute: 'country', operator: 'equals', value: ['BR'] },
    { attribute: 'email', operator: 'contains', value: '' },
    { attribute: 'country', operator: 'starts_with', value: 'B' },
    { attribute: '', operator: 'equals', value: 'BR' },
  ])('AC-4.2 (contract): rejects $operator with value $value', (condition) => {
    expect(segmentConditionSchema.safeParse(condition).success).toBe(false);
  });
});

describe('segmentDefinitionSchema', () => {
  it('AC-4.1 (contract): requires key, name and rules', () => {
    expect(
      segmentDefinitionSchema.safeParse({
        key: 'br-mobile',
        name: 'Brazil on mobile',
        rules: { conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }] },
      }).success,
    ).toBe(true);
    expect(segmentDefinitionSchema.safeParse({ key: 'br-mobile', name: 'x' }).success).toBe(false);
  });
});
