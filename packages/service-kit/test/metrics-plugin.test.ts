import Fastify from 'fastify';
import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';

import { createHttpMetrics, metricsPlugin } from '../src/metrics-plugin.js';

describe('createHttpMetrics', () => {
  it('names the metrics after the prefix of the service', async () => {
    const registry = new Registry();
    createHttpMetrics(registry, 'lever_test_');
    const names = (await registry.getMetricsAsJSON()).map((metric) => metric.name);
    expect(names).toContain('lever_test_http_requests_total');
    expect(names).toContain('lever_test_http_request_duration_seconds');
    expect(names).toContain('lever_test_process_cpu_user_seconds_total');
  });
});

describe('metricsPlugin', () => {
  it('records requests by route pattern and exposes /metrics', async () => {
    const metrics = createHttpMetrics(new Registry(), 'lever_test_');
    const app = Fastify({ logger: false });
    await app.register(metricsPlugin, { metrics });
    app.get('/items/:id', () => ({ ok: true }));

    await app.inject({ method: 'GET', url: '/items/1' });
    await app.inject({ method: 'GET', url: '/items/2' });
    await app.inject({ method: 'GET', url: '/missing' });

    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain(
      'lever_test_http_requests_total{method="GET",route="/items/:id",status_code="200"} 2',
    );
    expect(response.body).toContain(
      'lever_test_http_requests_total{method="GET",route="unmatched",status_code="404"} 1',
    );
    expect(response.body).toContain('lever_test_http_request_duration_seconds_bucket');
    await app.close();
  });
});
