import type { FastifyPluginAsync } from 'fastify';

import { requireApiKey } from '../auth/api-key-auth.js';
import type { ApiKeyStore } from '../auth/api-key-store.js';

export interface V1RoutesOptions {
  apiKeys: ApiKeyStore;
}

/** Every `/v1` route requires an API key. */
export const v1Routes: FastifyPluginAsync<V1RoutesOptions> = (app, options) => {
  app.addHook('preHandler', requireApiKey(options.apiKeys));
  return Promise.resolve();
};
