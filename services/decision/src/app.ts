import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { ApiKeyStore } from './auth/api-key-store.js';
import { registerErrorHandlers } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1.js';

export interface AppDeps {
  logger: FastifyBaseLogger;
  apiKeys: ApiKeyStore;
}

/** Builds the Fastify app. Dependencies are created by `main.ts` (or by the tests). */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Hijacked SSE responses are closed by the stream route on shutdown.
    forceCloseConnections: true,
  });

  app.decorateRequest('auth', null);
  registerErrorHandlers(app);
  app.register(healthRoutes);
  app.register(v1Routes, { prefix: '/v1', apiKeys: deps.apiKeys });

  return app;
}
