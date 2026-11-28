import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers.js';

describe('GET /metrics', () => {
  it('exposes the request counter and latency histogram after a request', async () => {
    const app = createTestApp();
    await app.inject({ method: 'GET', url: '/healthz' });
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('lever_collector_http_requests_total');
    expect(response.body).toContain('lever_collector_http_request_duration_seconds');
    await app.close();
  });
});
