'use server';

import { flagTypeSchema, type EnvironmentKey } from '@lever/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ActionState } from '@/lib/action-state';
import { parseFlagValue, percentToBps, text } from '@/lib/form';
import { runAction } from '@/server/action';
import {
  createFlag,
  deleteFlag,
  getFlag,
  updateFlagDefault,
  updateFlagEnvironment,
} from '@/server/flags';

export async function createFlagAction(
  slug: string,
  _state: ActionState<{ id: string }>,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const state = await runAction(async (ctx) => {
    const type = flagTypeSchema.parse(text(form, 'type'));
    const flag = await createFlag(
      ctx,
      { slug },
      {
        key: text(form, 'key'),
        type,
        defaultValue: parseFlagValue(type, text(form, 'defaultValue')),
      },
    );
    return { id: flag.id };
  });
  if (state.status === 'success' && state.data !== undefined) {
    redirect(`/projects/${slug}/flags/${state.data.id}`);
  }
  return state;
}

export async function updateFlagDefaultAction(
  slug: string,
  flagId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    const flag = await getFlag(ctx, { slug }, flagId);
    await updateFlagDefault(
      ctx,
      { slug },
      flagId,
      parseFlagValue(flag.type, text(form, 'defaultValue')),
    );
  }, 'Valor padrão salvo');
  revalidatePath(`/projects/${slug}/flags/${flagId}`);
  return state;
}

export async function updateFlagEnvironmentAction(
  slug: string,
  flagId: string,
  environment: EnvironmentKey,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    const flag = await getFlag(ctx, { slug }, flagId);
    const segmentKey = text(form, 'segmentKey');
    await updateFlagEnvironment(ctx, { slug }, flagId, environment, {
      enabled: text(form, 'enabled') === 'on',
      servedValue: parseFlagValue(flag.type, text(form, 'servedValue')),
      rolloutBps: percentToBps(text(form, 'rolloutPercent')),
      segmentKey: segmentKey === '' ? null : segmentKey,
    });
  }, `Salvo em ${environment}`);
  revalidatePath(`/projects/${slug}/flags/${flagId}`);
  return state;
}

export async function deleteFlagAction(
  slug: string,
  flagId: string,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await deleteFlag(ctx, { slug }, flagId);
  });
  if (state.status === 'success') redirect(`/projects/${slug}/flags`);
  return state;
}
