import { describe, expect, it } from 'vitest';

import {
  BRAZILIAN_STATES,
  brazilianStateSchema,
  cleanOrderSchema,
  etlOrderSchema,
} from './orders.js';

const rawOrder = {
  orderId: 'order-1',
  userId: 'user-1',
  placedAt: '2026-11-27T12:00:00Z',
  items: [{ productId: 'p-1', quantity: 2, unitPriceCents: 1_500 }],
  totalCents: 3_000,
  customer: { name: 'Ana Silva', address: { street: 'Rua A, 10', city: 'Sao Paulo', state: 'SP' } },
};

const cleanOrder = {
  orderId: 'order-1',
  userId: 'user-1',
  placedAt: '2026-11-27T12:00:00Z',
  items: rawOrder.items,
  totalCents: 3_000,
  state: 'SP',
};

describe('order contracts', () => {
  it('002/AC-3.4: a raw order never passes as a clean order', () => {
    expect(etlOrderSchema.safeParse(rawOrder).success).toBe(true);
    expect(cleanOrderSchema.safeParse(rawOrder).success).toBe(false);
    expect(cleanOrderSchema.safeParse(cleanOrder).success).toBe(true);
  });

  it('002/AC-3.4: accepts only the 27 Brazilian states', () => {
    expect(BRAZILIAN_STATES).toHaveLength(27);
    expect(brazilianStateSchema.safeParse('SP').success).toBe(true);
    expect(brazilianStateSchema.safeParse('DF').success).toBe(true);
    expect(brazilianStateSchema.safeParse('XX').success).toBe(false);
    expect(brazilianStateSchema.safeParse('sp').success).toBe(false);
  });

  it('etl order requires at least one item with positive quantity', () => {
    const [item] = rawOrder.items;
    expect(etlOrderSchema.safeParse({ ...rawOrder, items: [] }).success).toBe(false);
    expect(
      etlOrderSchema.safeParse({ ...rawOrder, items: [{ ...item, quantity: 0 }] }).success,
    ).toBe(false);
    expect(etlOrderSchema.safeParse({ ...rawOrder, totalCents: -1 }).success).toBe(false);
  });
});
