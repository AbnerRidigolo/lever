import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { storeOrderStatusEnum } from './enums.js';

/**
 * Orders placed in the demo store, waiting for the ETL (spec 002, section 7.1). Holds the
 * customer's name and address, which the ETL must not copy to the silver (002/AC-3.4).
 */
export const storeOrders = pgTable(
  'store_orders',
  {
    id: id(),
    orderId: text('order_id').notNull().unique('store_orders_order_id_unique'),
    userId: text('user_id').notNull(),
    items: jsonb('items').notNull(),
    totalCents: integer('total_cents').notNull(),
    customerName: text('customer_name').notNull(),
    address: jsonb('address').notNull(),
    status: storeOrderStatusEnum('status').notNull().default('pending_etl'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    check('store_orders_total_cents_non_negative', sql`${table.totalCents} >= 0`),
    index('store_orders_pending_etl_idx')
      .on(table.placedAt)
      .where(sql`${table.status} = 'pending_etl'`),
  ],
);
