import { randomUUID } from 'node:crypto';

import { afterAll, inject } from 'vitest';

import { createDb, type Database } from '../src/client.js';
import { environments, projects, users } from '../src/schema/index.js';

/** Connects to the shared test database and closes the pool after the file. */
export function useTestDb(): Database {
  const { db, close } = createDb(inject('databaseUrl'), { maxConnections: 2 });
  afterAll(close);
  return db;
}

/** Runs a query that must fail and returns the Postgres error code (SQLSTATE). */
export async function pgErrorCode(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const code = findCode(error);
    if (code !== undefined) return code;
    throw error;
  }
  throw new Error('expected the query to fail, but it succeeded');
}

function findCode(error: unknown): string | undefined {
  // Drizzle wraps the driver error in `cause`.
  for (let current = error; current instanceof Error; current = current.cause) {
    if ('code' in current && typeof current.code === 'string') return current.code;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

export interface TestProject {
  projectId: string;
  developmentId: string;
  productionId: string;
  userId: string;
}

/** Creates an isolated project with both environments and a user. */
export async function createTestProject(db: Database): Promise<TestProject> {
  const suffix = randomUUID().slice(0, 8);
  const [project] = await db
    .insert(projects)
    .values({ name: `Test ${suffix}`, slug: `test-${suffix}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `user-${suffix}@example.test`, name: 'Test User' })
    .returning();
  if (project === undefined || user === undefined) throw new Error('insert returned no row');

  const envs = await db
    .insert(environments)
    .values([
      { projectId: project.id, key: 'development' },
      { projectId: project.id, key: 'production' },
    ])
    .returning();
  const developmentId = envs.find((env) => env.key === 'development')?.id;
  const productionId = envs.find((env) => env.key === 'production')?.id;
  if (developmentId === undefined || productionId === undefined) {
    throw new Error('environments were not created');
  }

  return { projectId: project.id, developmentId, productionId, userId: user.id };
}
