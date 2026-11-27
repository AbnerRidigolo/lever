import { createHash } from 'node:crypto';

import type { ExperimentConfig } from '@lever/schemas';

/** Stable UTF-8 JSON tuple; separators inside identifiers cannot alias another tuple. */
export function bucketOf(resourceKey: string, salt: string, userId: string): number {
  const digest = createHash('sha256')
    .update(JSON.stringify([resourceKey, salt, userId]), 'utf8')
    .digest();
  return digest.readUInt32BE(0) % 10_000;
}

/** Assign a bucket to cumulative variant weights in configuration order. */
export function assignVariant(experiment: ExperimentConfig, userId: string): string {
  const bucket = bucketOf(experiment.key, experiment.salt, userId);
  let boundary = 0;
  for (const variant of experiment.variants) {
    boundary += variant.weightBps;
    if (bucket < boundary) return variant.key;
  }
  throw new Error('Invalid experiment weights: no variant covers the bucket');
}
