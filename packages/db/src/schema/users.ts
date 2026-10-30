import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';

/** Console accounts. Property names follow what the Auth.js adapter expects (console plan, D2). */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  name: text('name'),
  /** The column keeps the name from the spec; `image` is the property Auth.js reads. */
  image: text('avatar_url'),
  ...timestamps(),
});
