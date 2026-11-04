import type {
  ExperimentConfig,
  FlagConfig,
  FlagValue,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

import { evaluateExperiment, evaluateFlag } from '@lever/evaluation';

/**
 * What the service needs from the evaluation code. The service only talks to this interface,
 * which keeps the routes testable without the author's implementation (decision plan, D1).
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

/** The author's implementation (reserved, see packages/evaluation). */
export const authorEvaluator: Evaluator = { evaluateFlag, evaluateExperiment };
