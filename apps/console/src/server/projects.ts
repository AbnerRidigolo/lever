import { ENVIRONMENT_KEYS, createProjectSchema, memberInputSchema } from '@lever/schemas';
import type { ProjectRole } from '@lever/schemas';
import { configVersions, environments, projectMembers, projects, sessions, users } from '@lever/db';
import { and, asc, count, eq } from 'drizzle-orm';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext } from './context';
import { DomainError, isUniqueViolation } from './errors';

export async function listProjects(ctx: ServiceContext) {
  return ctx.db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, ctx.userId))
    .orderBy(asc(projects.name));
}

/** Creates a project with both environments (FR-001); the creator becomes its admin. */
export async function createProject(ctx: ServiceContext, input: unknown) {
  const data = createProjectSchema.parse(input);
  try {
    return await ctx.db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values(data).returning();
      if (project === undefined) throw new Error('project was not inserted');

      await tx
        .insert(projectMembers)
        .values({ projectId: project.id, userId: ctx.userId, role: 'admin' });
      const created = await tx
        .insert(environments)
        .values(ENVIRONMENT_KEYS.map((key) => ({ projectId: project.id, key })))
        .returning({ id: environments.id });
      await tx
        .insert(configVersions)
        .values(created.map(({ id }) => ({ environmentId: id, version: 1 })));
      return project;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('conflict', `Já existe um projeto com o slug "${data.slug}"`);
    }
    throw error;
  }
}

export async function listEnvironments(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'viewer');
  return ctx.db
    .select({ id: environments.id, key: environments.key })
    .from(environments)
    .where(eq(environments.projectId, access.projectId))
    .orderBy(asc(environments.key));
}

export async function listMembers(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'viewer');
  return ctx.db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, access.projectId))
    .orderBy(asc(users.email));
}

/**
 * Adds a member by email, creating the user if needed. Only registered emails can sign in
 * (console plan, D5), so this is how someone gets access to the console.
 */
export async function addMember(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const access = await requireRole(ctx, where, 'admin');
  const data = memberInputSchema.parse(input);

  return ctx.db.transaction(async (tx) => {
    await tx.insert(users).values({ email: data.email }).onConflictDoNothing();
    const [user] = await tx.select().from(users).where(eq(users.email, data.email));
    if (user === undefined) throw new Error('user was not found after insert');

    const [member] = await tx
      .insert(projectMembers)
      .values({ projectId: access.projectId, userId: user.id, role: data.role })
      .onConflictDoNothing()
      .returning();
    if (member === undefined)
      throw new DomainError('conflict', 'Este e-mail já é membro do projeto');
    return member;
  });
}

async function assertNotLastAdmin(
  tx: Parameters<Parameters<ServiceContext['db']['transaction']>[0]>[0],
  projectId: string,
  userId: string,
): Promise<void> {
  const members = await tx
    .select({ userId: projectMembers.userId, role: projectMembers.role })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .for('update');
  const admins = members.filter((member) => member.role === 'admin');
  if (admins.length === 1 && admins[0]?.userId === userId) {
    throw new DomainError('conflict', 'O projeto precisa de ao menos um admin');
  }
}

export async function changeMemberRole(
  ctx: ServiceContext,
  where: ProjectRef,
  userId: string,
  role: ProjectRole,
) {
  const access = await requireRole(ctx, where, 'admin');
  await ctx.db.transaction(async (tx) => {
    if (role !== 'admin') await assertNotLastAdmin(tx, access.projectId, userId);
    const updated = await tx
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.projectId, access.projectId), eq(projectMembers.userId, userId)))
      .returning({ id: projectMembers.id });
    if (updated.length === 0) throw new DomainError('not_found', 'Membro não encontrado');
  });
}

/** Removes a member. A user left without any project also loses their open sessions. */
export async function removeMember(ctx: ServiceContext, where: ProjectRef, userId: string) {
  const access = await requireRole(ctx, where, 'admin');
  await ctx.db.transaction(async (tx) => {
    await assertNotLastAdmin(tx, access.projectId, userId);
    const removed = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, access.projectId), eq(projectMembers.userId, userId)))
      .returning({ id: projectMembers.id });
    if (removed.length === 0) throw new DomainError('not_found', 'Membro não encontrado');

    const [remaining] = await tx
      .select({ total: count() })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    if (remaining?.total === 0) await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}
