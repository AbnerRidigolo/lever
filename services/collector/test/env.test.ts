import { EnvValidationError } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import { loadCollectorEnv } from '../src/env.js';

const DATABASE_URL = 'postgres://lever:secret@localhost:5432/lever';

describe('loadCollectorEnv', () => {
  it('applies defaults', () => {
    expect(loadCollectorEnv({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      COLLECTOR_HOST: '0.0.0.0',
      COLLECTOR_PORT: 4100,
      LOG_LEVEL: 'info',
      API_KEY_CACHE_TTL_MS: 30_000,
      LAKE_S3_ENDPOINT: 'http://localhost:8333',
      LAKE_S3_ACCESS_KEY: 'lever-local-access-key',
      LAKE_S3_SECRET_KEY: 'lever-local-secret-key',
      LAKE_S3_REGION: 'us-east-1',
      LAKE_BUCKET: 'lever-lake',
      COLLECTOR_FLUSH_INTERVAL_MS: 1000,
      COLLECTOR_FLUSH_MAX_EVENTS: 5000,
      COLLECTOR_BUFFER_MAX_EVENTS: 100_000,
      COLLECTOR_SHUTDOWN_FLUSH_MS: 10_000,
      OTEL_SERVICE_NAME: 'lever-collector',
    });
  });

  it('parses numbers and the optional OTLP endpoint', () => {
    expect(
      loadCollectorEnv({
        DATABASE_URL,
        COLLECTOR_PORT: '4200',
        COLLECTOR_FLUSH_MAX_EVENTS: '10',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      }),
    ).toMatchObject({
      COLLECTOR_PORT: 4200,
      COLLECTOR_FLUSH_MAX_EVENTS: 10,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });
  });

  it('rejects an invalid port and names the variable', () => {
    expect(() => loadCollectorEnv({ DATABASE_URL, COLLECTOR_PORT: '99999' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadCollectorEnv({ DATABASE_URL, COLLECTOR_PORT: '99999' })).toThrow(
      /COLLECTOR_PORT/,
    );
  });

  it('rejects a missing database url', () => {
    expect(() => loadCollectorEnv({})).toThrow(/DATABASE_URL/);
  });
});
