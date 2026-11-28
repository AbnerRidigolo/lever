import { createHttpMetrics, type HttpMetrics } from '@lever/service-kit';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface Metrics extends HttpMetrics {
  /** Events by `type` and `outcome` (`accepted` or `rejected`); `reason` only on rejections. */
  events: Counter<'type' | 'outcome' | 'reason'>;
  /** Records per sink write. */
  batchEvents: Histogram;
  /** Records waiting in the buffer. */
  bufferEvents: Gauge;
  sinkWriteDuration: Histogram;
  sinkFailures: Counter;
}

const PREFIX = 'lever_collector_';

/** Collector metrics in a registry of their own (one per app). */
export function createMetrics(): Metrics {
  const registry = new Registry();
  const http = createHttpMetrics(registry, PREFIX);

  return {
    ...http,
    events: new Counter({
      name: `${PREFIX}events_total`,
      help: 'Events by type and outcome (accepted or rejected, with the rejection reason)',
      labelNames: ['type', 'outcome', 'reason'] as const,
      registers: [registry],
    }),
    batchEvents: new Histogram({
      name: `${PREFIX}batch_events`,
      help: 'Records per write to the bronze sink',
      buckets: [1, 10, 100, 500, 1000, 2500, 5000],
      registers: [registry],
    }),
    bufferEvents: new Gauge({
      name: `${PREFIX}buffer_events`,
      help: 'Accepted records waiting in memory for the bronze sink',
      registers: [registry],
    }),
    sinkWriteDuration: new Histogram({
      name: `${PREFIX}sink_write_duration_seconds`,
      help: 'Duration of writes to the bronze sink (successful or not)',
      buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    sinkFailures: new Counter({
      name: `${PREFIX}sink_failures_total`,
      help: 'Failed writes to the bronze sink',
      registers: [registry],
    }),
  };
}
