import type { FastifyPluginAsync } from 'fastify';

import { requireApiKey } from '../auth/api-key-auth.js';
import type { ApiKeyStore } from '../auth/api-key-store.js';
import type { ConfigStore } from '../config/config-store.js';
import type { Evaluator } from '../evaluator.js';
import { configRoutes } from './config.js';
import { evaluateRoutes } from './evaluate.js';
import { streamRoutes, type StreamRoutesOptions } from './stream.js';

export interface V1RoutesOptions {
  apiKeys: ApiKeyStore;
  configStore: ConfigStore;
  evaluator: Evaluator;
  stream: Omit<StreamRoutesOptions, 'configStore'>;
}

/** Every `/v1` route requires an API key. */
export const v1Routes: FastifyPluginAsync<V1RoutesOptions> = async (app, options) => {
  app.addHook('preHandler', requireApiKey(options.apiKeys));
  await app.register(configRoutes, { configStore: options.configStore });
  await app.register(evaluateRoutes, {
    configStore: options.configStore,
    evaluator: options.evaluator,
  });
  await app.register(streamRoutes, { configStore: options.configStore, ...options.stream });
};
