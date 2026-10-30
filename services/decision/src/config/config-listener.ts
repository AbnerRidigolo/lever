import { CONFIG_CHANGES_CHANNEL, configChangeNotificationSchema } from '@lever/schemas';
import type { FastifyBaseLogger } from 'fastify';
import postgres from 'postgres';

import type { ConfigStore } from './config-store.js';

export interface ConfigChangeListener {
  close(): Promise<void>;
}

export interface ListenOptions {
  databaseUrl: string;
  configStore: ConfigStore;
  logger: FastifyBaseLogger;
}

/**
 * Listens on `lever_config_changes` (FR-008) and refreshes the affected environment.
 * The connection reconnects on its own; after a reconnect every cached environment is
 * refreshed, because notifications sent while disconnected are lost.
 */
export async function listenForConfigChanges(
  options: ListenOptions,
): Promise<ConfigChangeListener> {
  const { configStore, logger } = options;
  const sql = postgres(options.databaseUrl, { max: 1, onnotice: () => undefined });
  let connectedBefore = false;

  const onNotify = (payload: string): void => {
    const notification = parseNotification(payload);
    if (notification === null) {
      logger.warn({ channel: CONFIG_CHANGES_CHANNEL }, 'ignoring malformed config notification');
      return;
    }
    logger.debug(notification, 'config change notified');
    void configStore.refresh(notification.environmentId, notification.version);
  };

  const onListen = (): void => {
    if (!connectedBefore) {
      connectedBefore = true;
      logger.info({ channel: CONFIG_CHANGES_CHANNEL }, 'listening for config changes');
      return;
    }
    logger.info({ channel: CONFIG_CHANGES_CHANNEL }, 'reconnected, refreshing every environment');
    void configStore.refreshAll();
  };

  await sql.listen(CONFIG_CHANGES_CHANNEL, onNotify, onListen);
  return { close: () => sql.end({ timeout: 5 }) };
}

function parseNotification(payload: string) {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  const result = configChangeNotificationSchema.safeParse(json);
  return result.success ? result.data : null;
}
