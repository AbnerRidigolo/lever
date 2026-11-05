import type { ConnectionState } from './connection.js';

/**
 * Snapshot returned by `getMetrics()` (spec 001 section 10, sdk plan D11). Counters only grow, so
 * the app turns them into rates (evaluations per second) with Prometheus `rate()`. The SDK does not
 * depend on any metrics library: the app reads this snapshot when its own metrics are collected.
 */
export interface LeverClientMetrics {
  /** `getFlag` calls. */
  flagEvaluations: number;
  /** `getVariant` calls. */
  experimentEvaluations: number;
  /** Evaluations where the evaluator threw or returned a value of the wrong type (D7). */
  evaluationErrors: number;
  /** Stream messages rejected by the schema (D8). */
  invalidMessages: number;
  /** Reconnection attempts scheduled after a failure (D3). */
  reconnects: number;
  /** Version of the cached configuration; null before the first one. */
  configVersion: number | null;
  /** Time since the server last confirmed the configuration (`config` or `ping`); null without one. */
  configAgeMs: number | null;
  connection: ConnectionState;
}

/** The counters owned by the client. */
export class ClientCounters {
  flagEvaluations = 0;
  experimentEvaluations = 0;
  evaluationErrors = 0;
  invalidMessages = 0;
}
