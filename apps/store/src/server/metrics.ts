import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

import type { EvaluationObserver } from '@/lever/adapter';

// SDK metrics exposed by the store (spec 001 section 10, store plan D8). "Evaluations per
// second" is `rate(lever_sdk_evaluations_total[1m])` in Prometheus.

export interface StoreMetrics {
  registry: Registry;
  observer: EvaluationObserver;
  /** Where the configuration age comes from: the adapter in use. */
  setConfigAgeSource(source: () => number | null): void;
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

  let configAge: () => number | null = () => null;
  new Gauge({
    name: 'lever_sdk_config_age_seconds',
    help: 'Seconds since the SDK received its last valid configuration (no sample when unknown)',
    // Labelled so reset() removes the sample: an unlabelled gauge would report 0 instead.
    labelNames: ['source'] as const,
    registers: [registry],
    collect() {
      const age = configAge();
      this.reset();
      if (age !== null) this.set({ source: 'lever' }, age);
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
    setConfigAgeSource(source) {
      configAge = source;
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
