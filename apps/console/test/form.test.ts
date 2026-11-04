import { segmentConditionSchema } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import {
  bpsToPercent,
  formatRuleValue,
  parseFlagValue,
  parseRuleValue,
  percentToBps,
} from '@/lib/form';

describe('form parsing', () => {
  it('converts percentages to basis points and back', () => {
    expect(percentToBps('10')).toBe(1_000);
    expect(percentToBps('12.5')).toBe(1_250);
    expect(percentToBps('')).toBeNaN();
    expect(percentToBps('abc')).toBeNaN();
    expect(bpsToPercent(1_250)).toBe('12.5');
  });

  it('AC-1.4: parses a value per flag type, leaving invalid text for the schema to reject', () => {
    expect(parseFlagValue('boolean', 'true')).toBe(true);
    expect(parseFlagValue('boolean', 'maybe')).toBe('maybe');
    expect(parseFlagValue('number', '3.5')).toBe(3.5);
    expect(parseFlagValue('number', 'abc')).toBeNaN();
    expect(parseFlagValue('string', '12')).toBe('12');
    expect(parseFlagValue('json', '{"a":1}')).toEqual({ a: 1 });
    expect(parseFlagValue('json', '{nope')).toBe('{nope');
  });

  it('AC-4.2: builds a value in the shape each operator requires', () => {
    const cases = [
      ['equals', 'BR', 'BR'],
      ['equals', '18', 18],
      ['not_equals', 'true', true],
      ['in', 'mobile, tablet', ['mobile', 'tablet']],
      ['not_in', '1, 2', [1, 2]],
      ['greater_than', '18', 18],
      ['less_than', '99.9', 99.9],
      ['contains', '@example.com', '@example.com'],
    ] as const;
    for (const [operator, raw, expected] of cases) {
      const value = parseRuleValue(operator, raw);
      expect(value).toEqual(expected);
      expect(segmentConditionSchema.safeParse({ attribute: 'a', operator, value }).success).toBe(
        true,
      );
    }
  });

  it('formats a rule value for editing', () => {
    expect(formatRuleValue(['a', 'b'])).toBe('a, b');
    expect(formatRuleValue(18)).toBe('18');
  });
});
