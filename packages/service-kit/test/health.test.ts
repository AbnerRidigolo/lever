import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { healthRoutes } from '../src/health.js';

describe('healthRoutes', () => {
  it('answers the liveness probe', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthRoutes);
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
