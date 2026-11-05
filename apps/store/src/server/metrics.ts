import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

import type { EvaluationObserver, LeverAdapter } from '@/lever/adapter';

// SDK metrics exposed by the store (spec 001 section 10, store plan D8). "Evaluations per
// second" is `rate(lever_sdk_evaluations_total[1m])` in Prometheus.

export type ConfigSource = Pick<LeverAdapter, 'configAgeSeconds' | 'configVersion'>;

const NO_CONFIG: ConfigSource = { configAgeSeconds: () => null, configVersion: () => null };

export interface StoreMetrics {
  registry: Registry;
  observer: EvaluationObserver;
  /** Where the configuration age and version come from: the adapter in use. */
  setConfigSource(source: ConfigSource): void;
}

export function createStoreMetrics(
  registry: Registry = new Registry(),
  options: { defaultMetrics?: boolean } = {},
): StoreMetrics {
  if (options.defaultMetrics ?? true) collectDefaultMetrics({ register: registry });

  const evaluations = new Counter({
    name: 'lever_sdk_evaluations_total',
    help: 'Flag and variant evaluations made by the store',
    labelNames: ['kind', 'key'] as const,
    registers: [registry],
  });
  const errors = new Counter({
    name: 'lever_sdk_evaluation_errors_total',
    help: 'Evaluations that failed and fell back to the default value or variant',
    labelNames: ['kind'] as const,
    registers: [registry],
  });

  let config: ConfigSource = NO_CONFIG;
  new Gauge({
    name: 'lever_sdk_config_age_seconds',
    help: 'Seconds since the SDK received its last valid configuration (no sample when unknown)',
    // Labelled so reset() removes the sample: an unlabelled gauge would report 0 instead.
    labelNames: ['source'] as const,
    registers: [registry],
    collect() {
      const age = config.configAgeSeconds();
      this.reset();
      if (age !== null) this.set({ source: 'lever' }, age);
    },
  });
  new Gauge({
    name: 'lever_sdk_config_version',
    help: 'Version of the configuration the SDK is using (no sample when unknown)',
    labelNames: ['source'] as const,
    registers: [registry],
    collect() {
      const version = config.configVersion();
      this.reset();
      if (version !== null) this.set({ source: 'lever' }, version);
    },
  });

  return {
    registry,
    observer: {
      evaluated: (kind, key) => {
        evaluations.inc({ kind, key });
      },
      failed: (kind) => {
        errors.inc({ kind });
      },
    },
    setConfigSource(source) {
      config = source;
    },
  };
}

const GLOBAL_KEY = '__leverStoreMetrics';
type GlobalWithMetrics = typeof globalThis & { [GLOBAL_KEY]?: StoreMetrics };

/** One registry per process, kept across hot reloads of `next dev`. */
export function storeMetrics(): StoreMetrics {
  const scope = globalThis as GlobalWithMetrics;
  const existing = scope[GLOBAL_KEY];
  if (existing !== undefined) return existing;
  const created = createStoreMetrics();
  scope[GLOBAL_KEY] = created;
  return created;
}
