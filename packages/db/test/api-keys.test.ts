import { describe, expect, it } from 'vitest';

import {
  API_KEY_PREFIX_LENGTH,
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
} from '../src/api-keys.js';

describe('api keys', () => {
  it('generates keys tagged with the environment', () => {
    expect(generateApiKey('development').key).toMatch(/^lvr_dev_/);
    expect(generateApiKey('production').key).toMatch(/^lvr_prd_/);
  });

  it('generates keys in the documented format', () => {
    const { key } = generateApiKey('development');
    expect(isApiKeyFormat(key)).toBe(true);
    expect(key).toHaveLength(8 + 43);
  });

  it('returns the prefix and the SHA-256 hash of the key, never storing the key itself', () => {
    const { key, prefix, hash } = generateApiKey('production');
    expect(prefix).toBe(key.slice(0, API_KEY_PREFIX_LENGTH));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
  });

  it('generates a different key every time', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey('development').key));
    expect(keys.size).toBe(100);
  });

  it('hashes deterministically', () => {
    expect(hashApiKey('lvr_dev_example')).toBe(hashApiKey('lvr_dev_example'));
    expect(hashApiKey('lvr_dev_example')).not.toBe(hashApiKey('lvr_dev_examplf'));
  });

  it.each(['', 'lvr_dev_short', 'lvr_xyz_' + 'a'.repeat(43), 'Bearer lvr_dev_' + 'a'.repeat(43)])(
    'rejects the malformed key %j',
    (value) => {
      expect(isApiKeyFormat(value)).toBe(false);
    },
  );
});
