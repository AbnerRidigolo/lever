import { z } from 'zod';

/** The 27 Brazilian federative units (26 states plus the Federal District). */
export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
export const brazilianStateSchema = z.enum(BRAZILIAN_STATES);
export type BrazilianState = z.infer<typeof brazilianStateSchema>;

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.int().min(1),
  unitPriceCents: z.int().min(0),
});

const orderCoreShape = {
  orderId: z.string().min(1).max(64),
  userId: z.string().min(1).max(256),
  placedAt: z.iso.datetime({ offset: true }),
  items: z.array(orderItemSchema).min(1),
  totalCents: z.int().min(0),
};

/** Raw order sent to the ETL, with customer data that must not reach the silver (002/AC-3.4). */
export const etlOrderSchema = z.object({
  ...orderCoreShape,
  customer: z.object({
    name: z.string().min(1).max(120),
    address: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: brazilianStateSchema,
    }),
  }),
});
export type EtlOrder = z.infer<typeof etlOrderSchema>;

/** Order as stored in the silver: no name, address reduced to the state. Strict on purpose. */
export const cleanOrderSchema = z.strictObject({
  ...orderCoreShape,
  state: brazilianStateSchema,
});
export type CleanOrder = z.infer<typeof cleanOrderSchema>;

/** Status of an order in the store's `store_orders` table: waiting for the ETL, or already loaded. */
export const STORE_ORDER_STATUSES = ['pending_etl', 'loaded'] as const;
export const storeOrderStatusSchema = z.enum(STORE_ORDER_STATUSES);
export type StoreOrderStatus = z.infer<typeof storeOrderStatusSchema>;
