import { MAX_BATCH_BYTES, createApiError, type EventBatchResponse } from '@lever/schemas';
import { HttpError, authOf, requireApiKey, type ApiKeyStore } from '@lever/service-kit';
import type { FastifyError, FastifyPluginCallback } from 'fastify';

import type { RecordQueue } from '../buffer.js';
import { ingestBatch } from '../ingest.js';

export interface EventsRouteOptions {
  apiKeys: ApiKeyStore;
  queue: RecordQueue;
  now: () => Date;
}

/** Seconds a client should wait before retrying after a 503 (collector plan, D5). */
const RETRY_AFTER_SECONDS = 5;

/** `POST /v1/events`: authenticates, validates each event, offers the bronze records. */
export const eventsRoutes: FastifyPluginCallback<EventsRouteOptions> = (app, options, done) => {
  // The shared error handler maps every Fastify 4xx to 400; the payload-size error keeps its 413.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.statusCode === 413) {
      return reply.status(413).send(
        createApiError('bad_request', `Request body exceeds ${MAX_BATCH_BYTES} bytes`, {
          requestId: request.id,
        }),
      );
    }
    throw error;
  });

  app.post(
    '/v1/events',
    { bodyLimit: MAX_BATCH_BYTES, preHandler: requireApiKey(options.apiKeys) },
    async (request, reply): Promise<EventBatchResponse> => {
      const { records, rejected } = ingestBatch(request.body, authOf(request), options.now());

      if (records.length > 0 && !options.queue.offer(records)) {
        void reply.header('retry-after', String(RETRY_AFTER_SECONDS));
        throw new HttpError('service_unavailable', 'Event buffer is full, retry shortly');
      }

      void reply.status(202);
      return { accepted: records.length, rejected };
    },
  );

  done();
};
