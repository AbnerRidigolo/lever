import type { FastifyPluginAsync } from 'fastify';

/** Liveness probe. It does not touch Postgres: the service keeps serving from cache without it. */
export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/healthz', () => ({ status: 'ok' }));
  return Promise.resolve();
};
