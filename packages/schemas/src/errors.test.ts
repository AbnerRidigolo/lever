import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EnvValidationError, parseEnv } from './env.js';
import {
  apiErrorSchema,
  createApiError,
  createValidationError,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
} from './errors.js';

describe('createApiError', () => {
  it('builds the standard error body', () => {
    const error = createApiError('not_found', 'Flag not found', { requestId: 'req-1' });
    expect(error).toEqual({
      error: { code: 'not_found', message: 'Flag not found', requestId: 'req-1' },
    });
    expect(apiErrorSchema.safeParse(error).success).toBe(true);
  });

  it('omits optional fields that were not given', () => {
    expect(createApiError('internal', 'Unexpected error')).toEqual({
      error: { code: 'internal', message: 'Unexpected error' },
    });
  });

  it('AC-7.2 (contract): maps forbidden to HTTP 403', () => {
    expect(ERROR_HTTP_STATUS.forbidden).toBe(403);
  });

  it('maps every error code to an HTTP error status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('createValidationError', () => {
  it('lists the path and message of each Zod issue', () => {
    const result = z.object({ user: z.object({ id: z.string() }) }).safeParse({ user: {} });
    expect(result.success).toBe(false);
    if (result.success) return;

    const error = createValidationError(result.error, 'req-2');
    expect(error.error.code).toBe('validation_failed');
    expect(error.error.requestId).toBe('req-2');
    expect(error.error.details?.map((detail) => detail.path)).toEqual(['user.id']);
    expect(error.error.details?.[0]?.message).not.toBe('');
    expect(apiErrorSchema.safeParse(error).success).toBe(true);
  });
});

describe('parseEnv', () => {
  const schema = z.object({ DATABASE_URL: z.url(), PORT: z.coerce.number().int() });

  it('returns the parsed variables', () => {
    expect(parseEnv(schema, { DATABASE_URL: 'postgres://localhost/db', PORT: '4000' })).toEqual({
      DATABASE_URL: 'postgres://localhost/db',
      PORT: 4000,
    });
  });

  it('throws listing every invalid variable', () => {
    expect(() => parseEnv(schema, { PORT: 'abc' })).toThrow(EnvValidationError);
    try {
      parseEnv(schema, { PORT: 'abc' });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      if (!(error instanceof EnvValidationError)) return;
      expect(error.issues).toHaveLength(2);
      expect(error.message).toContain('DATABASE_URL');
      expect(error.message).toContain('PORT');
    }
  });
});
