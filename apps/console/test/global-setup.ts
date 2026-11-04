import { createDb, runMigrations } from '@lever/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Same image as infra/docker-compose.yml.
const POSTGRES_IMAGE = 'pgvector/pgvector:0.8.7-pg17-trixie';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** One real Postgres for the suite (never a mock, see AGENTS.md), migrated once. */
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
