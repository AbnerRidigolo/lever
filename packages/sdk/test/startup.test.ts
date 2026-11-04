import { afterEach, describe, expect, it } from 'vitest';

import { connect } from './connection-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { testConfig } from './fixtures.js';
import { eventually, sleep } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

describe('startup with the decision service down (AC-5.5, D2, D3)', () => {
  it('AC-5.5: retries with growing delays while the service is down, then connects', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const port = fake.port;
    await fake.stop();

    const { connection, messages, logger, backoff } = connect(`http://127.0.0.1:${port}`, {
      initialDelayMs: 20,
      maxDelayMs: 200,
    });
    await eventually(() => {
      expect(connection.reconnects).toBeGreaterThanOrEqual(4);
    });
    const delays = logger
      .at('warn', 'decision stream unavailable; reconnecting')
      .map((entry) => entry.fields.delayMs as number);
    // Each wait is within [delay/2, delay] for delay = 20, 40, 80, 160, 200...
    delays.slice(0, 4).forEach((wait, attempt) => {
      const delay = Math.min(200, 20 * 2 ** attempt);
      expect(wait).toBeGreaterThanOrEqual(delay / 2);
      expect(wait).toBeLessThanOrEqual(delay);
    });
    expect(messages).toHaveLength(0);

    await fake.restart();
    await eventually(() => {
      expect(messages[0]).toMatchObject({ kind: 'config', config: { version: 1 } });
    });
    expect(connection.state).toBe('connected');
    // A valid configuration resets the backoff.
    expect(backoff.attempts).toBe(0);
  });

  it.each([503, 500, 429])('reconnects after http %i', async (status) => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.failWith = status;
    const { messages, logger } = connect(fake.url);

    await eventually(() => {
      expect(fake?.streamRequests()).toBeGreaterThanOrEqual(3);
    });
    expect(logger.at('warn')[0]?.fields).toMatchObject({ status });
    fake.failWith = null;
    await eventually(() => {
      expect(messages[0]?.kind).toBe('config');
    });
  });

  it('logs the standard error code of the response', async () => {
    fake = await FakeDecision.start({ config: null });
    const { logger } = connect(fake.url);
    await eventually(() => {
      expect(logger.at('warn').length).toBeGreaterThan(0);
    });
    expect(logger.at('warn')[0]?.fields.reason).toBe('http 503 (service_unavailable)');
  });

  it.each([401, 403, 404])('stops reconnecting after http %i (D3)', async (status) => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.failWith = status;
    const { connection, logger } = connect(fake.url);

    await eventually(() => {
      expect(connection.state).toBe('unauthorized');
    });
    await sleep(100);
    expect(fake.streamRequests()).toBe(1);
    expect(logger.at('error')[0]?.fields).toEqual({ status });
  });

  it('stops after a 401 for a wrong key, without logging the key', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const wrongKey = 'lvr_dev_wrong-key';
    const { connection, logger } = connect(fake.url, { apiKey: wrongKey });
    await eventually(() => {
      expect(connection.state).toBe('unauthorized');
    });
    expect(JSON.stringify(logger.entries)).not.toContain(wrongKey);
  });
});
