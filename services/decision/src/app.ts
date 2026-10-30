import { STREAM_PING_INTERVAL_MS } from '@lever/schemas';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { ApiKeyStore } from './auth/api-key-store.js';
import type { ConfigStore } from './config/config-store.js';
import { registerErrorHandlers } from './errors.js';
import type { Evaluator } from './evaluator.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1.js';

export interface AppDeps {
  logger: FastifyBaseLogger;
  apiKeys: ApiKeyStore;
  configStore: ConfigStore;
  evaluator: Evaluator;
  /** Interval between `ping` events; 15 s by default (spec 001, section 8). */
  streamPingIntervalMs?: number;
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
  app.register(v1Routes, {
    prefix: '/v1',
    apiKeys: deps.apiKeys,
    configStore: deps.configStore,
    evaluator: deps.evaluator,
    stream: { pingIntervalMs: deps.streamPingIntervalMs ?? STREAM_PING_INTERVAL_MS },
  });

  return app;
}
