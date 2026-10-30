import {
  evaluateRequestSchema,
  evaluateResponseSchema,
  type EnvironmentConfig,
  type EvaluateResponse,
  type FlagValue,
  type SegmentConfig,
} from '@lever/schemas';
import type { FastifyPluginAsync } from 'fastify';

import { authOf } from '../auth/api-key-auth.js';
import type { ConfigStore } from '../config/config-store.js';
import type { Evaluator } from '../evaluator.js';

export interface EvaluateRoutesOptions {
  configStore: ConfigStore;
  evaluator: Evaluator;
}

// Segment lookup per configuration version, built once instead of on every request.
const segmentIndexes = new WeakMap<EnvironmentConfig, ReadonlyMap<string, SegmentConfig>>();

function segmentsOf(config: EnvironmentConfig): ReadonlyMap<string, SegmentConfig> {
  let index = segmentIndexes.get(config);
  if (index === undefined) {
    index = new Map(config.segments.map((segment) => [segment.key, segment]));
    segmentIndexes.set(config, index);
  }
  return index;
}

/**
 * `POST /v1/evaluate` (FR-007): evaluates flags and experiments for one user. Without
 * `flags` or `experiments` in the body, every flag or experiment is evaluated; requested
 * keys that do not exist are left out of the response, so clients fall back to their defaults.
 */
export const evaluateRoutes: FastifyPluginAsync<EvaluateRoutesOptions> = (app, options) => {
  const { configStore, evaluator } = options;

  app.post('/evaluate', async (request): Promise<EvaluateResponse> => {
    const body = evaluateRequestSchema.parse(request.body);
    const config = await configStore.get(authOf(request).environmentId);
    const segments = segmentsOf(config);

    const wantedFlags = body.flags === undefined ? null : new Set(body.flags);
    const wantedExperiments = body.experiments === undefined ? null : new Set(body.experiments);

    const flags: Record<string, FlagValue> = {};
    for (const flag of config.flags) {
      if (wantedFlags === null || wantedFlags.has(flag.key)) {
        flags[flag.key] = evaluator.evaluateFlag(flag, body.user, segments);
      }
    }

    const experiments: Record<string, string> = {};
    for (const experiment of config.experiments) {
      if (wantedExperiments === null || wantedExperiments.has(experiment.key)) {
        experiments[experiment.key] = evaluator.evaluateExperiment(experiment, body.user, segments);
      }
    }

    return evaluateResponseSchema.parse({ flags, experiments, version: config.version });
  });

  return Promise.resolve();
};
