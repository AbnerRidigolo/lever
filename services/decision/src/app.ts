import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import { registerErrorHandlers } from './errors.js';
import { healthRoutes } from './routes/health.js';

export interface AppDeps {
  logger: FastifyBaseLogger;
}

/** Builds the Fastify app. Dependencies are created by `main.ts` (or by the tests). */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Hijacked SSE responses are closed by the stream route on shutdown.
    forceCloseConnections: true,
  });

  registerErrorHandlers(app);
  app.register(healthRoutes);

  return app;
}
