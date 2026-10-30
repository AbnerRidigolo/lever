import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import type { ConfigStore } from './config/config-store.js';

export interface Metrics {
  registry: Registry;
  httpRequests: Counter<'method' | 'route' | 'status_code'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  streamClients: Gauge<'environment_id'>;
}

export interface MetricsOptions {
  configStore: ConfigStore;
  now?: () => number;
}

/** Metrics of spec 001, section 10, in a registry of their own (one per app). */
export function createMetrics(options: MetricsOptions): Metrics {
  const { configStore } = options;
  const now = options.now ?? Date.now;
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'lever_decision_' });

  const httpRequests = new Counter({
    name: 'lever_decision_http_requests_total',
    help: 'HTTP requests by route and status code',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'lever_decision_http_request_duration_seconds',
    help: 'HTTP request latency by route',
    labelNames: ['method', 'route', 'status_code'] as const,
    // Fine-grained under 20 ms, the NFR-002 target.
    buckets: [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry],
  });

  const streamClients = new Gauge({
    name: 'lever_decision_stream_clients',
    help: 'Clients connected to /v1/stream',
    labelNames: ['environment_id'] as const,
    registers: [registry],
  });

  new Gauge({
    name: 'lever_decision_config_version',
    help: 'Configuration version served per environment',
    labelNames: ['environment_id'] as const,
    registers: [registry],
    collect() {
      this.reset();
      for (const [environmentId, info] of configStore.info()) {
        this.set({ environment_id: environmentId }, info.version);
      }
    },
  });

  new Gauge({
    name: 'lever_decision_config_age_seconds',
    help: 'Seconds since the served configuration of the environment was last updated',
    labelNames: ['environment_id'] as const,
    registers: [registry],
    collect() {
      this.reset();
      const current = now();
      for (const [environmentId, info] of configStore.info()) {
        this.set({ environment_id: environmentId }, (current - info.loadedAt) / 1000);
      }
    },
  });

  return { registry, httpRequests, httpRequestDuration, streamClients };
}
