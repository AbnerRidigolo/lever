import { pgTable, text } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';

/** Console accounts. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  ...timestamps(),
});
