import type { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import type { Metrics } from '../metrics.js';

export interface MetricsPluginOptions {
  metrics: Metrics;
}

/**
 * Records every HTTP request and exposes `GET /metrics` for Prometheus. Registered with
 * fastify-plugin so the hook sees the routes of every other plugin.
 */
const metricsRoutes: FastifyPluginAsync<MetricsPluginOptions> = (app, options) => {
  const { metrics } = options;

  app.addHook('onResponse', async (request, reply) => {
    const labels = {
      method: request.method,
      // The route pattern, never the raw URL, to keep label cardinality bounded.
      route: request.routeOptions.url ?? 'unmatched',
      status_code: String(reply.statusCode),
    };
    metrics.httpRequests.inc(labels);
    metrics.httpRequestDuration.observe(labels, reply.elapsedTime / 1000);
    return Promise.resolve();
  });

  app.get('/metrics', async (_request, reply) => {
    void reply.type(metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  return Promise.resolve();
};

export const metricsPlugin = fastifyPlugin(metricsRoutes, { name: 'lever-metrics' });
