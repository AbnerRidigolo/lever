import { projectMembers, projects } from '@lever/db';
import type { ProjectRole } from '@lever/schemas';
import { and, eq } from 'drizzle-orm';

import type { ServiceContext } from './context';
import { DomainError } from './errors';

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, editor: 1, admin: 2 };

export function hasRole(role: ProjectRole, minimum: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export interface ProjectAccess {
  projectId: string;
  slug: string;
  name: string;
  role: ProjectRole;
}

export type ProjectRef = { projectId: string } | { slug: string };

/**
 * Checks that the user can act on a project (AC-7.2). Non-members get `not_found`, so the
 * project's existence is not revealed; members without the role get `forbidden`.
 */
export async function requireRole(
  ctx: ServiceContext,
  where: ProjectRef,
  minimum: ProjectRole,
): Promise<ProjectAccess> {
  const [row] = await ctx.db
    .select({
      projectId: projects.id,
      slug: projects.slug,
      name: projects.name,
      role: projectMembers.role,
    })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, ctx.userId)),
    )
    .where('slug' in where ? eq(projects.slug, where.slug) : eq(projects.id, where.projectId));

  if (row === undefined) throw new DomainError('not_found', 'Projeto não encontrado');
  if (!hasRole(row.role, minimum)) {
    throw new DomainError('forbidden', 'Seu papel não permite esta ação');
  }
  return row;
}
