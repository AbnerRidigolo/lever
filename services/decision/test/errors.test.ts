import { apiErrorSchema } from '@lever/schemas';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from '../src/app.js';
import { HttpError } from '../src/errors.js';

const app = buildApp({ logger: pino({ level: 'silent' }) });

beforeAll(async () => {
  app.get('/test/http-error', () => {
    throw new HttpError('service_unavailable', 'No configuration published');
  });
  app.get('/test/zod-error', () => z.object({ id: z.string() }).parse({}));
  app.get('/test/crash', () => {
    throw new Error('database password is hunter2');
  });
  app.post('/test/json', (request) => request.body);
  await app.ready();
});

afterAll(() => app.close());

describe('standard errors', () => {
  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBeDefined();
  });

  it('maps HttpError to its status and code', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/http-error' });
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).error).toMatchObject({
      code: 'service_unavailable',
      message: 'No configuration published',
    });
  });

  it('maps validation errors to 422 with details', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/zod-error' });
    expect(response.statusCode).toBe(422);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.map((detail) => detail.path)).toEqual(['id']);
  });

  it('maps malformed JSON to 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/json',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('bad_request');
  });

  it('returns 500 without leaking internal details', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/crash' });
    expect(response.statusCode).toBe(500);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error).toMatchObject({ code: 'internal', message: 'Internal server error' });
    expect(response.body).not.toContain('hunter2');
  });

  it('answers the liveness probe', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
