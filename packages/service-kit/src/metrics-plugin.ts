import type { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { collectDefaultMetrics, Counter, Histogram, type Registry } from 'prom-client';

/** The HTTP metrics every service exposes, recorded by `metricsPlugin`. */
export interface HttpMetrics {
  registry: Registry;
  httpRequests: Counter<'method' | 'route' | 'status_code'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
}

/**
 * Registers the default process metrics and the HTTP metrics in `registry`. `prefix` starts every
 * metric name and includes its trailing underscore (for example `lever_decision_`).
 */
export function createHttpMetrics(registry: Registry, prefix: string): HttpMetrics {
  collectDefaultMetrics({ register: registry, prefix });

  const httpRequests = new Counter({
    name: `${prefix}http_requests_total`,
    help: 'HTTP requests by route and status code',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: `${prefix}http_request_duration_seconds`,
    help: 'HTTP request latency by route',
    labelNames: ['method', 'route', 'status_code'] as const,
    // Fine-grained under 20 ms, the decision service NFR-002 target.
    buckets: [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry],
  });

  return { registry, httpRequests, httpRequestDuration };
}

export interface MetricsPluginOptions {
  metrics: HttpMetrics;
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
