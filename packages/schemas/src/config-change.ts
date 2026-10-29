import { z } from 'zod';

import { configVersionSchema, uuidSchema } from './common.js';

/**
 * Postgres channel notified when a configuration version is published (FR-008).
 * A trigger on `config_versions` sends the notification in the same transaction as the insert,
 * so listeners only see versions that were committed.
 */
export const CONFIG_CHANGES_CHANNEL = 'lever_config_changes';

/** Payload of a notification on `CONFIG_CHANGES_CHANNEL`, sent as JSON text. */
export const configChangeNotificationSchema = z.object({
  environmentId: uuidSchema,
  version: configVersionSchema,
});
export type ConfigChangeNotification = z.infer<typeof configChangeNotificationSchema>;
