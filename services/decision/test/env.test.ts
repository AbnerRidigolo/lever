import { EnvValidationError } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { loadDecisionEnv } from '../src/env.js';
import { createLogger } from '../src/logger.js';

const DATABASE_URL = 'postgres://lever:secret@localhost:5432/lever';

describe('loadDecisionEnv', () => {
  it('applies defaults', () => {
    expect(loadDecisionEnv({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      DECISION_HOST: '0.0.0.0',
      DECISION_PORT: 4000,
      LOG_LEVEL: 'info',
      API_KEY_CACHE_TTL_MS: 30_000,
      OTEL_SERVICE_NAME: 'lever-decision',
    });
  });

  it('parses numbers and the optional OTLP endpoint', () => {
    const env = loadDecisionEnv({
      DATABASE_URL,
      DECISION_PORT: '4100',
      API_KEY_CACHE_TTL_MS: '1000',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });
    expect(env).toMatchObject({
      DECISION_PORT: 4100,
      API_KEY_CACHE_TTL_MS: 1000,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });
  });

  it('rejects a missing database url and an invalid port', () => {
    expect(() => loadDecisionEnv({ DECISION_PORT: '99999' })).toThrow(EnvValidationError);
  });
});

describe('createLogger', () => {
  it('redacts the authorization header', () => {
    const lines: string[] = [];
    const logger = createLogger('info', { write: (line: string) => lines.push(line) });

    logger.info({ req: { headers: { authorization: 'Bearer lvr_dev_secret' } } }, 'request');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('lvr_dev_secret');
    expect(lines[0]).toContain('[redacted]');
    expect(lines[0]).toContain('"service":"lever-decision"');
  });
});
