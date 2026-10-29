import type { z } from 'zod';

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment variables:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Validates environment variables against a schema, listing every invalid variable on failure. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
