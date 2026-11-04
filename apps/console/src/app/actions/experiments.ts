'use server';

import type { EnvironmentKey, ExperimentStatus } from '@lever/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ActionState } from '@/lib/action-state';
import { text } from '@/lib/form';
import { runAction } from '@/server/action';
import {
  createExperiment,
  deleteExperiment,
  transitionExperiment,
  updateExperiment,
} from '@/server/experiments';

function jsonField(form: FormData, name: string): unknown {
  try {
    return JSON.parse(text(form, name));
  } catch {
    return null;
  }
}

function nullable(value: string): string | null {
  return value === '' ? null : value;
}

export async function createExperimentAction(
  slug: string,
  _state: ActionState<{ id: string }>,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const state = await runAction(async (ctx) => {
    const experiment = await createExperiment(
      ctx,
      { slug },
      {
        key: text(form, 'key'),
        hypothesis: text(form, 'hypothesis'),
        variants: jsonField(form, 'variants'),
        segmentKey: nullable(text(form, 'segmentKey')),
      },
    );
    return { id: experiment.id };
  });
  if (state.status === 'success' && state.data !== undefined) {
    redirect(`/projects/${slug}/experiments/${state.data.id}`);
  }
  return state;
}

export async function updateExperimentAction(
  slug: string,
  experimentId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await updateExperiment(ctx, { slug }, experimentId, {
      hypothesis: text(form, 'hypothesis'),
      variants: jsonField(form, 'variants'),
      segmentKey: nullable(text(form, 'segmentKey')),
    });
  }, 'Experimento salvo');
  revalidatePath(`/projects/${slug}/experiments/${experimentId}`);
  return state;
}

export async function transitionExperimentAction(
  slug: string,
  experimentId: string,
  environment: EnvironmentKey,
  to: ExperimentStatus,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await transitionExperiment(ctx, { slug }, experimentId, { environment, to });
  });
  revalidatePath(`/projects/${slug}/experiments/${experimentId}`);
  return state;
}

export async function deleteExperimentAction(
  slug: string,
  experimentId: string,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await deleteExperiment(ctx, { slug }, experimentId);
  });
  if (state.status === 'success') redirect(`/projects/${slug}/experiments`);
  return state;
}
