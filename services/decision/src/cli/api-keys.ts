import { apiKeys, environments, generateApiKey, projects, type Database } from '@lever/db';
import { environmentKeySchema, resourceKeySchema } from '@lever/schemas';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

export const createApiKeyArgsSchema = z.object({
  project: resourceKeySchema.default('demo-store'),
  env: environmentKeySchema,
  name: z.string().trim().min(1).max(120).default('local development'),
});
export type CreateApiKeyArgs = z.infer<typeof createApiKeyArgsSchema>;

export interface CreatedApiKey {
  id: string;
  /** Shown once and never stored (AC-7.3). */
  key: string;
  prefix: string;
}

/** Creates an API key for a project environment, storing only its hash (decision plan, D9). */
export async function createApiKeyFor(
  db: Database,
  args: CreateApiKeyArgs,
): Promise<CreatedApiKey> {
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(projects.id, environments.projectId))
    .where(and(eq(projects.slug, args.project), eq(environments.key, args.env)));
  if (environment === undefined) {
    throw new Error(`environment "${args.env}" of project "${args.project}" not found`);
  }

  const generated = generateApiKey(args.env);
  const [row] = await db
    .insert(apiKeys)
    .values({
      environmentId: environment.id,
      name: args.name,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
    })
    .returning({ id: apiKeys.id });
  if (row === undefined) throw new Error('api key was not inserted');

  return { id: row.id, key: generated.key, prefix: generated.prefix };
}
