import { flagValueSchema, resourceKeySchema } from '@lever/schemas';
import { z } from 'zod';

/**
 * Values forced by the stub adapter, from `LEVER_STUB_OVERRIDES` (everyone) and from the
 * `lever_stub_overrides` cookie (one browser). Only the stub reads them (store plan, D1).
 */
export const stubOverridesSchema = z.object({
  flags: z.record(resourceKeySchema, flagValueSchema).default({}),
  experiments: z.record(resourceKeySchema, resourceKeySchema).default({}),
});
export type StubOverrides = z.output<typeof stubOverridesSchema>;

export const EMPTY_OVERRIDES: StubOverrides = { flags: {}, experiments: {} };

/** Later sources win, key by key. */
export function mergeOverrides(...sources: (StubOverrides | undefined)[]): StubOverrides {
  return sources.reduce<StubOverrides>(
    (merged, source) =>
      source === undefined
        ? merged
        : {
            flags: { ...merged.flags, ...source.flags },
            experiments: { ...merged.experiments, ...source.experiments },
          },
    EMPTY_OVERRIDES,
  );
}
