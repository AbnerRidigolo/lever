import type {
  ExperimentConfig,
  FlagConfig,
  FlagValue,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

// RESERVED FOR THE AUTHOR (AGENTS.md): segment rules and rollout evaluation.
// Only the signatures live here; tests derived from the spec are in test/author/.
// Requirements: AC-1.3, AC-2.x, AC-3.5, AC-4.1 to AC-4.4.

/** Whether the user matches every condition of the segment (AND, spec 001 section 13). */
export function matchesSegment(_segment: SegmentConfig, _user: UserContext): boolean {
  throw new Error('not implemented: reserved for author');
}

/** Value of a flag for a user: the served value or the flag default. */
export function evaluateFlag(
  _flag: FlagConfig,
  _user: UserContext,
  _segments: ReadonlyMap<string, SegmentConfig>,
): FlagValue {
  throw new Error('not implemented: reserved for author');
}

/** Variant key of a user in an experiment; the control variant when the user is not assigned. */
export function evaluateExperiment(
  _experiment: ExperimentConfig,
  _user: UserContext,
  _segments: ReadonlyMap<string, SegmentConfig>,
): string {
  throw new Error('not implemented: reserved for author');
}
