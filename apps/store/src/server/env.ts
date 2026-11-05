import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

import { stubOverridesSchema } from '@/lever/stub-overrides';

// `.env` files often carry `KEY=` for unset values; treat them as absent.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const stubOverridesJson = z.string().transform((value, ctx) => {
  try {
    return stubOverridesSchema.parse(JSON.parse(value));
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be JSON in the stub overrides format' });
    return z.NEVER;
  }
});

export const storeEnvSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Only the stub exists until @lever/sdk merges; T12 adds 'sdk' (store plan, D1).
  LEVER_ADAPTER: z.enum(['stub']).default('stub'),
  LEVER_DECISION_URL: z.url().default('http://localhost:4000'),
  LEVER_API_KEY: optional(z.string().min(1)),
  // Values forced for everyone by the stub adapter, e.g. {"flags":{"new-banner":true}}.
  LEVER_STUB_OVERRIDES: optional(stubOverridesJson),
  // Signs the fictitious account cookie (store plan, D4 and Q2).
  STORE_SESSION_SECRET: z.string().min(16),
});
export type StoreEnv = z.infer<typeof storeEnvSchema>;

let cached: StoreEnv | undefined;

/** Read on first use, because `next build` imports server code without a runtime environment. */
export function storeEnv(): StoreEnv {
  cached ??= parseEnv(storeEnvSchema, process.env);
  return cached;
}

/** Modes of `LEVER_ADAPTER`, including the one T12 adds when @lever/sdk merges. */
export type LeverAdapterMode = 'stub' | 'sdk';

export function leverAdapterMode(): LeverAdapterMode {
  return storeEnv().LEVER_ADAPTER;
}
