import { createHttpMetrics, type HttpMetrics } from '@lever/service-kit';
import { Gauge, Registry } from 'prom-client';

import type { ConfigStore } from './config/config-store.js';

export interface Metrics extends HttpMetrics {
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
  const http = createHttpMetrics(registry, 'lever_decision_');

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

  return { ...http, streamClients };
}
