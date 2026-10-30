import type {
  ExperimentConfig,
  FlagConfig,
  FlagValue,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

import { evaluateExperiment, evaluateFlag } from './evaluation/index.js';

/**
 * What the service needs from the evaluation code. The service only talks to this interface,
 * so the author's implementation can move to a package shared with the SDK (decision plan, D1).
 */
export interface Evaluator {
  evaluateFlag(
    flag: FlagConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ): FlagValue;
  evaluateExperiment(
    experiment: ExperimentConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ): string;
}

/** The author's implementation (reserved, see src/evaluation/). */
export const authorEvaluator: Evaluator = { evaluateFlag, evaluateExperiment };
