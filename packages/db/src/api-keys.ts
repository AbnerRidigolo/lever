import { createHash, randomBytes } from 'node:crypto';

import type { EnvironmentKey } from '@lever/schemas';

// API key format (spec 001, section 13): `lvr_<dev|prd>_<32 random bytes in base64url>`.
// Only the SHA-256 of the key is stored; the key has 256 random bits, so a fast hash is enough
// and lets the decision service look keys up by the unique index on `key_hash`.

const ENVIRONMENT_TAGS = {
  development: 'dev',
  production: 'prd',
} as const satisfies Record<EnvironmentKey, string>;

export const API_KEY_RANDOM_BYTES = 32;
export const API_KEY_PREFIX_LENGTH = 12;
export const API_KEY_PATTERN = /^lvr_(?:dev|prd)_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  /** Full key. Show it once, on creation, and never store it (AC-7.3). */
  key: string;
  /** Stored in `api_keys.key_prefix` so the console can show a masked key. */
  prefix: string;
  /** Stored in `api_keys.key_hash`. */
  hash: string;
}

export function generateApiKey(environment: EnvironmentKey): GeneratedApiKey {
  const random = randomBytes(API_KEY_RANDOM_BYTES).toString('base64url');
  const key = `lvr_${ENVIRONMENT_TAGS[environment]}_${random}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function isApiKeyFormat(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}
