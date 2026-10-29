import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** Primary key shared by every table (spec 001, section 7). */
export function id() {
  return uuid('id').primaryKey().defaultRandom();
}

/** `created_at` and `updated_at`, present on every table (spec 001, section 7). */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}
