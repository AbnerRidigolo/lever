import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers.js';

describe('GET /healthz', () => {
  it('answers 200 { status: "ok" }', async () => {
    const app = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
