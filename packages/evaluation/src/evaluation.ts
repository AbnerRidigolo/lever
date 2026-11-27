import type {
  ExperimentConfig,
  FlagConfig,
  FlagValue,
  SegmentCondition,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

import { assignVariant, bucketOf } from './assignment.js';

function matchesCondition(condition: SegmentCondition, user: UserContext): boolean {
  if (!Object.hasOwn(user.attributes, condition.attribute)) return false;
  const value = user.attributes[condition.attribute];
  if (value === undefined) return false;
  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return typeof value === typeof condition.value && value !== condition.value;
    case 'in':
      return (
        (typeof value === 'string' || typeof value === 'number') && condition.value.includes(value)
      );
    case 'not_in':
      return (
        (typeof value === 'string' || typeof value === 'number') && !condition.value.includes(value)
      );
    case 'greater_than':
      return typeof value === 'number' && value > condition.value;
    case 'less_than':
      return typeof value === 'number' && value < condition.value;
    case 'contains':
      return (typeof value === 'string' || Array.isArray(value)) && value.includes(condition.value);
  }
}

/** All conditions must match, with no implicit type coercion. */
export function matchesSegment(segment: SegmentConfig, user: UserContext): boolean {
  return segment.rules.conditions.every((condition) => matchesCondition(condition, user));
}

function isTargeted(
  key: string | null,
  user: UserContext,
  segments: ReadonlyMap<string, SegmentConfig>,
): boolean {
  if (key === null) return true;
  const segment = segments.get(key);
  return segment !== undefined && matchesSegment(segment, user);
}

export function evaluateFlag(
  flag: FlagConfig,
  user: UserContext,
  segments: ReadonlyMap<string, SegmentConfig>,
): FlagValue {
  if (!flag.enabled || !isTargeted(flag.segmentKey, user, segments)) return flag.defaultValue;
  return bucketOf(flag.key, flag.salt, user.id) < flag.rolloutBps
    ? flag.servedValue
    : flag.defaultValue;
}

export function evaluateExperiment(
  experiment: ExperimentConfig,
  user: UserContext,
  segments: ReadonlyMap<string, SegmentConfig>,
): string {
  if (experiment.status === 'running' && isTargeted(experiment.segmentKey, user, segments)) {
    return assignVariant(experiment, user.id);
  }
  const control = experiment.variants.find((variant) => variant.isControl);
  if (control === undefined) throw new Error('Invalid experiment: missing control variant');
  return control.key;
}
