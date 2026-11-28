import {
  healthRoutes,
  metricsPlugin,
  registerErrorHandlers,
  type ApiKeyStore,
} from '@lever/service-kit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { RecordQueue } from './buffer.js';
import { eventsRoutes } from './routes/events.js';
import { createMetrics, type Metrics } from './metrics.js';

export interface AppDeps {
  logger: FastifyBaseLogger;
  apiKeys: ApiKeyStore;
  /** Receives accepted records; the ingest route (T3) uses it. */
  queue: RecordQueue;
  /** Created when omitted. */
  metrics?: Metrics;
  /** Server clock for `receivedAt`; tests inject it. */
  now?: () => Date;
}

/** Builds the Fastify app. Dependencies are created by `main.ts` (or by the tests). */
export function buildApp(deps: AppDeps): FastifyInstance {
  const metrics = deps.metrics ?? createMetrics();
  const app = Fastify({ loggerInstance: deps.logger });

  app.decorateRequest('auth', null);
  registerErrorHandlers(app);
  app.register(metricsPlugin, { metrics });
  app.register(healthRoutes);
  app.register(eventsRoutes, {
    apiKeys: deps.apiKeys,
    queue: deps.queue,
    metrics,
    now: deps.now ?? (() => new Date()),
  });

  return app;
}
