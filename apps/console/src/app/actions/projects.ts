'use server';

import { projectRoleSchema } from '@lever/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ActionState } from '@/lib/action-state';
import { text } from '@/lib/form';
import { runAction } from '@/server/action';
import { addMember, changeMemberRole, createProject, removeMember } from '@/server/projects';

export async function createProjectAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const slug = text(form, 'slug');
  const state = await runAction(async (ctx) => {
    await createProject(ctx, { name: text(form, 'name'), slug });
  });
  if (state.status === 'success') redirect(`/projects/${slug}`);
  return state;
}

export async function addMemberAction(
  slug: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await addMember(ctx, { slug }, { email: text(form, 'email'), role: text(form, 'role') });
  }, 'Membro adicionado');
  revalidatePath(`/projects/${slug}/members`);
  return state;
}

export async function changeMemberRoleAction(
  slug: string,
  userId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await changeMemberRole(ctx, { slug }, userId, projectRoleSchema.parse(text(form, 'role')));
  }, 'Papel alterado');
  revalidatePath(`/projects/${slug}/members`);
  return state;
}

export async function removeMemberAction(
  slug: string,
  userId: string,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await removeMember(ctx, { slug }, userId);
  });
  revalidatePath(`/projects/${slug}/members`);
  return state;
}
