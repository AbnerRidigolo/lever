import type { Database } from '@lever/db';

/** Who is acting, and on which database. Every operation of src/server receives this. */
export interface ServiceContext {
  db: Database;
  userId: string;
}

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
