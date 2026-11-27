import { describe, expect, it } from 'vitest';

import { AUDIT_RESOURCE_TYPES } from './audit.js';
import { experimentMetricsSchema, metricDefinitionSchema } from './metrics.js';

const common = {
  key: 'checkout-rate',
  name: 'Checkout rate',
  direction: 'increase',
  eventName: 'order_placed',
};

type Role = 'primary' | 'secondary' | 'guardrail';

function entries(roles: Role[]) {
  return roles.map((role, index) => ({ metricKey: `metric-${index}`, role }));
}

function repeat(role: Role, count: number): Role[] {
  return Array.from({ length: count }, () => role);
}

describe('metricDefinitionSchema', () => {
  it('002/AC-4.1: each metric type requires its own fields', () => {
    expect(metricDefinitionSchema.safeParse({ ...common, type: 'conversion' }).success).toBe(true);
    expect(metricDefinitionSchema.safeParse({ ...common, type: 'mean' }).success).toBe(false);
    expect(
      metricDefinitionSchema.safeParse({ ...common, type: 'mean', valueProperty: 'total' }).success,
    ).toBe(true);
    expect(metricDefinitionSchema.safeParse({ ...common, type: 'ratio' }).success).toBe(false);
    expect(
      metricDefinitionSchema.safeParse({
        ...common,
        type: 'ratio',
        denominatorEventName: 'page_view',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid event names and property names', () => {
    expect(
      metricDefinitionSchema.safeParse({ ...common, type: 'conversion', eventName: 'Order Placed' })
        .success,
    ).toBe(false);
    expect(
      metricDefinitionSchema.safeParse({ ...common, type: 'mean', valueProperty: '' }).success,
    ).toBe(false);
    expect(
      metricDefinitionSchema.safeParse({ ...common, type: 'mean', valueProperty: 'x'.repeat(65) })
        .success,
    ).toBe(false);
    expect(
      metricDefinitionSchema.safeParse({
        ...common,
        type: 'ratio',
        denominatorEventName: 'Page View',
      }).success,
    ).toBe(false);
  });
});

describe('experimentMetricsSchema', () => {
  it('002/AC-4.2: exactly one primary, up to 10 secondary, any guardrails, unique keys', () => {
    expect(experimentMetricsSchema.safeParse(entries(['secondary'])).success).toBe(false);
    expect(experimentMetricsSchema.safeParse(entries(['primary', 'primary'])).success).toBe(false);
    expect(experimentMetricsSchema.safeParse(entries(['primary'])).success).toBe(true);

    const withSecondary = (count: number) => entries(['primary', ...repeat('secondary', count)]);
    expect(experimentMetricsSchema.safeParse(withSecondary(10)).success).toBe(true);
    expect(experimentMetricsSchema.safeParse(withSecondary(11)).success).toBe(false);

    expect(
      experimentMetricsSchema.safeParse(entries(['primary', ...repeat('guardrail', 20)])).success,
    ).toBe(true);

    expect(
      experimentMetricsSchema.safeParse([
        { metricKey: 'same', role: 'primary' },
        { metricKey: 'same', role: 'guardrail' },
      ]).success,
    ).toBe(false);
  });
});

describe('audit', () => {
  it('002/AC-4.4: metric changes are audited', () => {
    expect(AUDIT_RESOURCE_TYPES).toContain('metric');
  });
});
