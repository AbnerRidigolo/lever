import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

import { createDb } from '../src/client.js';
import { runMigrations } from '../src/migrate.js';
import { POSTGRES_IMAGE } from './postgres-image.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Starts a real Postgres (never a mock, see AGENTS.md) and applies every migration once. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  const { db, close } = createDb(databaseUrl, { maxConnections: 1 });
  try {
    await runMigrations(db);
  } finally {
    await close();
  }

  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
