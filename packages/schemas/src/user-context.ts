import { z } from 'zod';

export const userAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
export type UserAttributeValue = z.infer<typeof userAttributeValueSchema>;

/** End user being evaluated: `{ id, attributes }` (spec 001, section 8). */
export const userContextSchema = z.object({
  id: z.string().min(1).max(256),
  attributes: z.record(z.string().min(1).max(128), userAttributeValueSchema),
});
export type UserContext = z.infer<typeof userContextSchema>;
