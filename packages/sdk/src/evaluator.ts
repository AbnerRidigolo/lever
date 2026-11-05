import { evaluateExperiment, evaluateFlag, matchesSegment } from '@lever/evaluation';
import type {
  ExperimentConfig,
  FlagConfig,
  FlagValue,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

/**
 * What the SDK needs from the evaluation code. The public client always uses `defaultEvaluator`;
 * only the tests pass another one, through the internal `createClient` (sdk plan, D13).
 */
export interface Evaluator {
  readonly evaluateFlag: (
    flag: FlagConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ) => FlagValue;
  readonly evaluateExperiment: (
    experiment: ExperimentConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ) => string;
  readonly matchesSegment: (segment: SegmentConfig, user: UserContext) => boolean;
}

/** The author's implementation in @lever/evaluation, shared with the decision service (AC-5.8). */
export const defaultEvaluator: Evaluator = { evaluateFlag, evaluateExperiment, matchesSegment };
