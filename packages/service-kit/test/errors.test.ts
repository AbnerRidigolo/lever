import { apiErrorSchema } from '@lever/schemas';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { HttpError, registerErrorHandlers } from '../src/errors.js';

const app = Fastify({ logger: false });

beforeAll(async () => {
  registerErrorHandlers(app);
  app.get('/http-error', () => {
    throw new HttpError('service_unavailable', 'Try later', [{ path: 'a', message: 'b' }]);
  });
  app.get('/unauthorized', () => {
    throw new HttpError('unauthorized', 'Nope');
  });
  app.get('/zod-error', () => z.object({ id: z.string() }).parse({}));
  app.get('/crash', () => {
    throw new Error('database password is hunter2');
  });
  app.post('/json', (request) => request.body);
  await app.ready();
});

afterAll(() => app.close());

describe('registerErrorHandlers', () => {
  it('answers unknown routes with the standard 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe('Route GET /nope not found');
    expect(body.error.requestId).toBeDefined();
  });

  it('maps HttpError to its status, code and details', async () => {
    const response = await app.inject({ method: 'GET', url: '/http-error' });
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).error).toMatchObject({
      code: 'service_unavailable',
      message: 'Try later',
      details: [{ path: 'a', message: 'b' }],
    });
  });

  it('adds the WWW-Authenticate header to 401 responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/unauthorized' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('maps ZodError to 422 with the failing paths', async () => {
    const response = await app.inject({ method: 'GET', url: '/zod-error' });
    expect(response.statusCode).toBe(422);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.map((detail) => detail.path)).toEqual(['id']);
  });

  it('maps malformed JSON to 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/json',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('bad_request');
  });

  it('returns 500 without leaking internal details', async () => {
    const response = await app.inject({ method: 'GET', url: '/crash' });
    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(response.json()).error).toMatchObject({
      code: 'internal',
      message: 'Internal server error',
    });
    expect(response.body).not.toContain('hunter2');
  });
});
