import { EnvValidationError, parseEnv } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { storeEnvSchema } from '@/server/env';

const SECRET = 'fictitious-store-secret-0123';

describe('store env', () => {
  it('applies the defaults of the stub adapter', () => {
    const env = parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET });
    expect(env.LEVER_ADAPTER).toBe('stub');
    expect(env.LEVER_DECISION_URL).toBe('http://localhost:4000');
    expect(env.LEVER_API_KEY).toBeUndefined();
  });

  it('treats an empty API key as absent', () => {
    const env = parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_API_KEY: '' });
    expect(env.LEVER_API_KEY).toBeUndefined();
  });

  it('requires a session secret of at least 16 characters', () => {
    expect(() => parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: 'short' })).toThrow(
      EnvValidationError,
    );
    expect(() => parseEnv(storeEnvSchema, {})).toThrow(EnvValidationError);
  });

  it('rejects an adapter that does not exist yet', () => {
    expect(() =>
      parseEnv(storeEnvSchema, { STORE_SESSION_SECRET: SECRET, LEVER_ADAPTER: 'sdk' }),
    ).toThrow(EnvValidationError);
  });
});
