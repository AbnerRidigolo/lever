import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { storeOrders } from '../src/schema/index.js';
import { PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode, useTestDb } from './helpers.js';

const db = useTestDb();

function orderRow(overrides: Partial<typeof storeOrders.$inferInsert> = {}) {
  return {
    orderId: `order-${randomUUID()}`,
    userId: 'user-1',
    items: [{ productId: 'p-1', quantity: 1, unitPriceCents: 1000 }],
    totalCents: 1000,
    customerName: 'Synthetic Customer',
    address: { street: 'Rua Ficticia 1', city: 'Sao Paulo', state: 'SP' },
    placedAt: new Date(),
    ...overrides,
  };
}

describe('store orders', () => {
  it('002/AC-3.4: order ids are unique', async () => {
    const row = orderRow();
    await db.insert(storeOrders).values(row);
    expect(await pgErrorCode(db.insert(storeOrders).values(row))).toBe(PG_UNIQUE_VIOLATION);
  });

  it('002/AC-10.2: new orders wait for the ETL', async () => {
    const [order] = await db.insert(storeOrders).values(orderRow()).returning();
    expect(order?.status).toBe('pending_etl');
  });

  it('rejects a negative total', async () => {
    expect(await pgErrorCode(db.insert(storeOrders).values(orderRow({ totalCents: -1 })))).toBe(
      PG_CHECK_VIOLATION,
    );
  });

  it('indexes pending orders by placement time', async () => {
    const rows = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'store_orders' AND indexname = 'store_orders_pending_etl_idx'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain("status = 'pending_etl'");
  });
});
