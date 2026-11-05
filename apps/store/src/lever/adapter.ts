import type { FlagValue, UserContext } from '@lever/schemas';

/**
 * What the store needs from Lever (store plan, D1). Pages never import the SDK or the stub:
 * they use `getLever()`, which returns the configured implementation wrapped by `withSafety`.
 */
export interface LeverAdapter {
  /** Flag value for the user, or `defaultValue` (AC-5.1). */
  getFlag<T extends FlagValue>(key: string, user: UserContext, defaultValue: T): Promise<T>;
  /** Variant key of the user, or `fallbackVariant` when there is none (AC-5.2). */
  getVariant(key: string, user: UserContext, fallbackVariant: string): Promise<string>;
  /** Seconds since the last valid configuration; null when there is none (stub). */
  configAgeSeconds(): number | null;
  /** Version of the configuration in use; null when there is none (stub). */
  configVersion(): number | null;
}

export type EvaluationKind = 'flag' | 'variant';

/** Receives every evaluation, for the metrics of spec section 10 (store plan, D8). */
export interface EvaluationObserver {
  evaluated(kind: EvaluationKind, key: string): void;
  failed(kind: EvaluationKind): void;
}

export const noopObserver: EvaluationObserver = {
  evaluated: () => undefined,
  failed: () => undefined,
};

function shapeOf(value: FlagValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Whether a flag value has the same JSON shape as the default (boolean, number, array...). */
export function sameFlagType<T extends FlagValue>(value: FlagValue, reference: T): value is T {
  return shapeOf(value) === shapeOf(reference);
}
