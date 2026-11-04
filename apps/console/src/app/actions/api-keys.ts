'use server';

import { revalidatePath } from 'next/cache';

import type { ActionState } from '@/lib/action-state';
import { text } from '@/lib/form';
import { runAction } from '@/server/action';
import { createApiKey, revokeApiKey } from '@/server/api-keys';

export async function createApiKeyAction(
  slug: string,
  _state: ActionState<{ key: string }>,
  form: FormData,
): Promise<ActionState<{ key: string }>> {
  const state = await runAction(async (ctx) => {
    const created = await createApiKey(
      ctx,
      { slug },
      { name: text(form, 'name'), environment: text(form, 'environment') },
    );
    return { key: created.key };
  });
  revalidatePath(`/projects/${slug}/api-keys`);
  return state;
}

export async function revokeApiKeyAction(
  slug: string,
  apiKeyId: string,
  _state: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const state = await runAction(async (ctx) => {
    await revokeApiKey(ctx, { slug }, apiKeyId);
  });
  revalidatePath(`/projects/${slug}/api-keys`);
  return state;
}
