import {
  createApiError,
  createValidationError,
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ErrorDetail,
} from '@lever/schemas';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Error that maps to one of the standard error codes of `@lever/schemas`. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.details = details;
  }
}

function isFastifyClientError(error: unknown): error is FastifyError & { statusCode: number } {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

/** Every error leaves the service in the standard format (AGENTS.md). */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof HttpError) {
      if (error.code === 'internal' || error.code === 'service_unavailable') {
        request.log.error({ err: error }, error.message);
      }
      if (error.code === 'unauthorized') {
        void reply.header('www-authenticate', 'Bearer');
      }
      return reply.status(ERROR_HTTP_STATUS[error.code]).send(
        createApiError(error.code, error.message, {
          requestId,
          ...(error.details === undefined ? {} : { details: error.details }),
        }),
      );
    }

    if (error instanceof ZodError) {
      return reply
        .status(ERROR_HTTP_STATUS.validation_failed)
        .send(createValidationError(error, requestId));
    }

    if (isFastifyClientError(error)) {
      return reply
        .status(ERROR_HTTP_STATUS.bad_request)
        .send(createApiError('bad_request', error.message, { requestId }));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(ERROR_HTTP_STATUS.internal)
      .send(createApiError('internal', 'Internal server error', { requestId }));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(ERROR_HTTP_STATUS.not_found).send(
      createApiError('not_found', `Route ${request.method} ${request.url} not found`, {
        requestId: request.id,
      }),
    );
  });
}
