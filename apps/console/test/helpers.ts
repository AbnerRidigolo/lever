import { randomUUID } from 'node:crypto';

import { configVersions, createDb, environments, users, type Database } from '@lever/db';
import type { EnvironmentKey, ErrorCode, ProjectRole } from '@lever/schemas';
import { and, eq, max } from 'drizzle-orm';
import { afterAll, expect, inject } from 'vitest';

import type { ServiceContext } from '@/server/context';
import { DomainError } from '@/server/errors';
import { addMember, createProject } from '@/server/projects';

/** Connects to the shared test database and closes the pool after the file. */
export function connectTestDb(): Database {
  const { db, close } = createDb(inject('databaseUrl'), { maxConnections: 6 });
  afterAll(close);
  return db;
}

export async function createUser(db: Database): Promise<ServiceContext> {
  const [user] = await db
    .insert(users)
    .values({ email: `user-${randomUUID()}@example.test` })
    .returning();
  if (user === undefined) throw new Error('user was not inserted');
  return { db, userId: user.id };
}

export interface TestProject {
  projectId: string;
  slug: string;
  admin: ServiceContext;
}

/** A new project, created by a new admin. */
export async function createTestProject(db: Database): Promise<TestProject> {
  const admin = await createUser(db);
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const project = await createProject(admin, { name: `Project ${slug}`, slug });
  return { projectId: project.id, slug, admin };
}

/** Adds a new user to the project with this role. */
export async function memberWith(project: TestProject, role: ProjectRole): Promise<ServiceContext> {
  const email = `member-${randomUUID()}@example.test`;
  const member = await addMember(project.admin, { projectId: project.projectId }, { email, role });
  return { db: project.admin.db, userId: member.userId };
}

export async function environmentId(
  db: Database,
  projectId: string,
  key: EnvironmentKey,
): Promise<string> {
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.key, key)));
  if (environment === undefined) throw new Error(`environment ${key} not found`);
  return environment.id;
}

export async function latestVersion(
  db: Database,
  projectId: string,
  key: EnvironmentKey,
): Promise<number> {
  const id = await environmentId(db, projectId, key);
  const [row] = await db
    .select({ version: max(configVersions.version) })
    .from(configVersions)
    .where(eq(configVersions.environmentId, id));
  return row?.version ?? 0;
}

/** Asserts that an operation fails with this standard error code. */
export async function expectCode(operation: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await operation.then(
    () => new Error(`expected ${code}, but the operation succeeded`),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}
