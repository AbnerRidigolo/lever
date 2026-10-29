import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { environments } from './projects.js';

/**
 * SDK API keys, one environment each. Only the hash of the key is stored;
 * `key_prefix` lets the console show a masked key (spec 001, section 13).
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('api_keys_environment_id_idx').on(table.environmentId)],
);
