import { hashApiKey, isApiKeyFormat } from '@lever/db';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { HttpError } from '../errors.js';
import type { ApiKeyStore, AuthenticatedKey } from './api-key-store.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedKey | null;
  }
}

const BEARER_PATTERN = /^Bearer (\S+)$/;

/** preHandler that requires `Authorization: Bearer <api key>` (FR-005). */
export function requireApiKey(store: ApiKeyStore): preHandlerAsyncHookHandler {
  return async (request) => {
    const token = BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined || !isApiKeyFormat(token)) {
      throw new HttpError('unauthorized', 'Missing or malformed API key');
    }

    const key = await store.resolve(hashApiKey(token));
    if (key === null) {
      throw new HttpError('unauthorized', 'Invalid or revoked API key');
    }
    request.auth = key;
  };
}

/** The authenticated key of a request that went through `requireApiKey`. */
export function authOf(request: FastifyRequest): AuthenticatedKey {
  if (request.auth === null) {
    throw new HttpError('internal', 'Route is missing the API key preHandler');
  }
  return request.auth;
}
