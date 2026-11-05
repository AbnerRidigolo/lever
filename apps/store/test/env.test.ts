import { EnvValidationError, parseEnv } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { storeEnvSchema } from '@/server/env';

const SECRET = 'fictitious-store-secret-0123';
const KEY = 'lvr_dev_fictitious-key-for-tests';

describe('store env', () => {
  it('uses the SDK by default and requires its API key', () => {
    const env = parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_API_KEY: KEY });
    expect(env.LEVER_ADAPTER).toBe('sdk');
    expect(env.LEVER_DECISION_URL).toBe('http://localhost:4000');
    expect(env.LEVER_API_KEY).toBe(KEY);

    expect(() => parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET })).toThrow(
      /LEVER_API_KEY: is required when LEVER_ADAPTER=sdk/,
    );
  });

  it('treats an empty API key as absent', () => {
    expect(() =>
      parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_API_KEY: '' }),
    ).toThrow(EnvValidationError);
  });

  it('runs the stub without an API key', () => {
    const env = parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_ADAPTER: 'stub' });
    expect(env.LEVER_ADAPTER).toBe('stub');
    expect(env.LEVER_API_KEY).toBeUndefined();
  });

  it('requires a session secret of at least 16 characters', () => {
    expect(() =>
      parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: 'short', LEVER_ADAPTER: 'stub' }),
    ).toThrow(EnvValidationError);
    expect(() => parseEnv(storeEnvSchema, { LEVER_ADAPTER: 'stub' })).toThrow(EnvValidationError);
  });

  it('rejects an unknown adapter', () => {
    expect(() =>
      parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_ADAPTER: 'remote' }),
    ).toThrow(EnvValidationError);
  });
});
