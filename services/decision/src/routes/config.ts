import type { EnvironmentConfig } from '@lever/schemas';
import type { FastifyPluginAsync } from 'fastify';

import { authOf } from '../auth/api-key-auth.js';
import type { ConfigStore } from '../config/config-store.js';

export interface ConfigRoutesOptions {
  configStore: ConfigStore;
}

/** `GET /v1/config`: full configuration of the API key's environment (FR-005). */
export const configRoutes: FastifyPluginAsync<ConfigRoutesOptions> = (app, options) => {
  app.get('/config', async (request): Promise<EnvironmentConfig> => {
    return options.configStore.get(authOf(request).environmentId);
  });
  return Promise.resolve();
};
