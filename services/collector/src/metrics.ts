import { createHttpMetrics, type HttpMetrics } from '@lever/service-kit';
import { Registry } from 'prom-client';

export type Metrics = HttpMetrics;

/** Collector metrics in a registry of their own (one per app). */
export function createMetrics(): Metrics {
  return createHttpMetrics(new Registry(), 'lever_collector_');
}
