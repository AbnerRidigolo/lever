import { createDb, projectMembers, projects, runMigrations, seed, users } from '@lever/db';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

import { ADMIN_DATABASE_URL, E2E_DATABASE_URL, EDITOR_EMAIL, VIEWER_EMAIL } from './env';

// Recreates the E2E database: migrations, seed, plus an editor and a viewer in the demo project.
const admin = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => undefined });
await admin.unsafe('DROP DATABASE IF EXISTS lever_e2e WITH (FORCE)');
await admin.unsafe('CREATE DATABASE lever_e2e');
await admin.end();

const { db, close } = createDb(E2E_DATABASE_URL, { maxConnections: 1 });
await runMigrations(db);
await seed(db);

const [project] = await db.select().from(projects).where(eq(projects.slug, 'demo-store'));
if (project === undefined) throw new Error('seed project missing');

const members = [
  { email: EDITOR_EMAIL, role: 'editor' as const },
  { email: VIEWER_EMAIL, role: 'viewer' as const },
];
for (const { email, role } of members) {
  const [user] = await db.insert(users).values({ email }).returning();
  if (user === undefined) throw new Error('user was not inserted');
  await db.insert(projectMembers).values({ projectId: project.id, userId: user.id, role });
}
await close();
