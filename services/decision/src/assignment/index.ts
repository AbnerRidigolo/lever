import type { ExperimentConfig } from '@lever/schemas';

// RESERVED FOR THE AUTHOR (AGENTS.md): variant assignment, hash and bucketing.
// Only the signatures live here; tests derived from the spec are in test/author/.
// Requirements: FR-004, AC-2.1 to AC-2.3, AC-3.2 to AC-3.4 and ADR-002 (hash function).

/**
 * Deterministic bucket of a user for a resource, from 0 to 9,999 (basis points).
 * Depends only on the resource key, its salt and the user id (FR-004).
 */
export function bucketOf(_resourceKey: string, _salt: string, _userId: string): number {
  throw new Error('not implemented: reserved for author');
}

/** Variant key of a user in a running experiment, following the variant weights. */
export function assignVariant(_experiment: ExperimentConfig, _userId: string): string {
  throw new Error('not implemented: reserved for author');
}
