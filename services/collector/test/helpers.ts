import { ApiKeyStore } from '@lever/service-kit';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';

import { buildApp } from '../src/app.js';
import type { RecordQueue } from '../src/buffer.js';

export const silentLogger = pino({ level: 'silent' });

export function createTestApp(): FastifyInstance {
  const queue: RecordQueue = { offer: () => true };
  const apiKeys = new ApiKeyStore({
    source: { find: () => Promise.resolve(null), touch: () => Promise.resolve() },
    logger: silentLogger,
    ttlMs: 1000,
  });
  return buildApp({ logger: silentLogger, apiKeys, queue });
}
