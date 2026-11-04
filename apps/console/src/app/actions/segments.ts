'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ActionState } from '@/lib/action-state';
import { text } from '@/lib/form';
import { runAction } from '@/server/action';
import { createSegment, deleteSegment, updateSegment } from '@/server/segments';

function rulesOf(form: FormData): unknown {
  try {
    return JSON.parse(text(form, 'rules'));
  } catch {
    return null;
  }
}

export async function createSegmentAction(
  slug: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await createSegment(
      ctx,
      { slug },
      { key: text(form, 'key'), name: text(form, 'name'), rules: rulesOf(form) },
    );
  }, 'Segmento criado');
  revalidatePath(`/projects/${slug}/segments`);
  return state;
}

export async function updateSegmentAction(
  slug: string,
  segmentId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await updateSegment(
      ctx,
      { slug },
      { id: segmentId, name: text(form, 'name'), rules: rulesOf(form) },
    );
  }, 'Segmento salvo');
  revalidatePath(`/projects/${slug}/segments/${segmentId}`);
  return state;
}

export async function deleteSegmentAction(
  slug: string,
  segmentId: string,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await deleteSegment(ctx, { slug }, segmentId);
  });
  if (state.status === 'success') redirect(`/projects/${slug}/segments`);
  return state;
}
