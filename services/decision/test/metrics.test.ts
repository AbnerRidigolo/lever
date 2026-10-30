import { beforeAll, describe, expect, it } from 'vitest';

import { ConfigStore } from '../src/config/config-store.js';
import { createMetrics } from '../src/metrics.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  eventually,
  seededEnvironmentId,
  silentLogger,
  useTestDb,
} from './helpers.js';
import { openStream } from './sse.js';

const db = useTestDb();
const { app } = createTestApp(db, { streamPingIntervalMs: 60_000 });

let developmentId: string;
let devKey: string;
let baseUrl: string;

beforeAll(async () => {
  developmentId = await seededEnvironmentId(db, 'development');
  devKey = (await createApiKey(db, developmentId, 'development')).key;
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

async function scrape(): Promise<string> {
  const response = await app.inject({ method: 'GET', url: '/metrics' });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('text/plain');
  return response.body;
}

describe('GET /metrics', () => {
  it('counts requests by route pattern and status, with a latency histogram', async () => {
    await app.inject({ method: 'GET', url: '/v1/config', headers: bearer(devKey) });
    await app.inject({ method: 'GET', url: '/v1/config' });
    await app.inject({ method: 'GET', url: '/no/such/route' });

    const body = await scrape();
    expect(body).toContain(
      'lever_decision_http_requests_total{method="GET",route="/v1/config",status_code="200"}',
    );
    expect(body).toContain(
      'lever_decision_http_requests_total{method="GET",route="/v1/config",status_code="401"}',
    );
    expect(body).toContain('route="unmatched",status_code="404"');
    expect(body).toContain('lever_decision_http_request_duration_seconds_bucket{le="0.02"');
  });

  it('exposes the served config version and its age per environment', async () => {
    const body = await scrape();
    expect(body).toMatch(
      new RegExp(`lever_decision_config_version\\{environment_id="${developmentId}"\\} \\d+`),
    );
    expect(body).toContain(`lever_decision_config_age_seconds{environment_id="${developmentId}"}`);
  });

  it('tracks connected stream clients', async () => {
    const gauge = `lever_decision_stream_clients{environment_id="${developmentId}"}`;
    const client = await openStream(`${baseUrl}/v1/stream`, bearer(devKey));
    await client.next();
    expect(await scrape()).toContain(`${gauge} 1`);

    client.close();
    await eventually(async () => {
      expect(await scrape()).toContain(`${gauge} 0`);
    });
  });

  it('includes default process metrics', async () => {
    expect(await scrape()).toContain('lever_decision_process_cpu_seconds_total');
  });
});

describe('createMetrics', () => {
  it('computes the config age at scrape time', async () => {
    let now = 10_000;
    const store = new ConfigStore({
      logger: silentLogger,
      now: () => now,
      load: () => Promise.resolve({ version: 2, flags: [], experiments: [], segments: [] }),
    });
    const metrics = createMetrics({ configStore: store, now: () => now });
    await store.get('env-a');
    now += 4_500;

    const age = await metrics.registry.getSingleMetricAsString('lever_decision_config_age_seconds');
    expect(age).toContain('lever_decision_config_age_seconds{environment_id="env-a"} 4.5');
  });
});
