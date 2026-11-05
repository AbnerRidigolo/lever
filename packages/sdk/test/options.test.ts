import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  resolveOptions,
} from '../src/options.js';
import { capturingLogger, TEST_API_KEY } from './helpers.js';

const valid = { apiKey: TEST_API_KEY, baseUrl: 'http://localhost:4000' };

describe('client options (Zod at the boundary)', () => {
  it('applies the defaults of D3 and D4', () => {
    const options = resolveOptions(valid);
    expect(options.backoff).toEqual({
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
    });
    expect(options.heartbeatTimeoutMs).toBe(DEFAULT_HEARTBEAT_TIMEOUT_MS);
    expect(DEFAULT_HEARTBEAT_TIMEOUT_MS).toBe(45_000);
    expect(options.logger).toBeUndefined();
  });

  it('accepts production keys, https urls, partial backoff and a logger', () => {
    const logger = capturingLogger();
    const options = resolveOptions({
      apiKey: 'lvr_prd_abcDEF-123_xyz',
      baseUrl: 'https://decision.example.test',
      logger,
      backoff: { maxDelayMs: 1_000 },
      heartbeatTimeoutMs: 100,
    });
    expect(options.backoff).toEqual({
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: 1_000,
    });
    expect(options.logger).toBe(logger);
  });

  it.each([
    ['malformed api key', { ...valid, apiKey: 'secret-value-123' }, 'apiKey'],
    ['unknown environment prefix', { ...valid, apiKey: 'lvr_stg_abc' }, 'apiKey'],
    ['invalid base url', { ...valid, baseUrl: 'not a url' }, 'baseUrl'],
    ['non http base url', { ...valid, baseUrl: 'ftp://host' }, 'baseUrl'],
    ['logger without methods', { ...valid, logger: { info: () => undefined } }, 'logger'],
    ['zero heartbeat', { ...valid, heartbeatTimeoutMs: 0 }, 'heartbeatTimeoutMs'],
    [
      'initial delay above the cap',
      { ...valid, backoff: { initialDelayMs: 5_000, maxDelayMs: 1_000 } },
      'backoff.initialDelayMs',
    ],
  ])('rejects %s', (_name, options, path) => {
    expect(() => resolveOptions(options)).toThrow(path);
  });

  it('never puts the api key in the error message', () => {
    const secret = 'lvr_dev_has spaces so it is invalid';
    try {
      resolveOptions({ ...valid, apiKey: secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect(String(error)).not.toContain(secret);
    }
  });

  it('rejects a missing options object', () => {
    expect(() => resolveOptions(undefined)).toThrow('(root)');
  });
});
