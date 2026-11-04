import { afterEach, describe, expect, it } from 'vitest';

import { connect } from './connection-helpers.js';
import { FakeDecision } from './fake-decision.js';
import { testConfig } from './fixtures.js';
import { eventually, sleep, TEST_API_KEY } from './helpers.js';

let fake: FakeDecision | undefined;
afterEach(async () => {
  await fake?.stop().catch(() => undefined);
  fake = undefined;
});

describe('stream connection (FR-006, AC-5.4 to AC-5.6, D3, D4)', () => {
  it('opens the stream with the bearer key and receives the initial config', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { connection, messages } = connect(`${fake.url}/`);

    await eventually(() => {
      expect(messages[0]).toMatchObject({ kind: 'config', config: { version: 1 } });
    });
    expect(connection.state).toBe('connected');
    expect(fake.requests[0]).toEqual({
      path: '/v1/stream',
      authorization: `Bearer ${TEST_API_KEY}`,
    });
  });

  it('delivers updates and pings on the open stream', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { messages } = connect(fake.url);
    await eventually(() => {
      expect(fake?.openStreams).toBe(1);
    });

    fake.pushConfig(testConfig(2));
    fake.ping();
    await eventually(() => {
      expect(messages.map((message) => message.kind)).toEqual(['config', 'config', 'ping']);
    });
  });

  it('reconnects with backoff when the stream drops (AC-5.6)', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { connection, messages, logger } = connect(fake.url);
    await eventually(() => {
      expect(fake?.openStreams).toBe(1);
    });

    fake.dropStreams();
    await eventually(() => {
      expect(fake?.streamRequests()).toBe(2);
      expect(messages.filter((message) => message.kind === 'config')).toHaveLength(2);
    });
    expect(connection.reconnects).toBe(1);
    expect(logger.at('warn', 'decision stream unavailable; reconnecting')[0]?.fields).toMatchObject(
      { reason: expect.any(String) as string, attempt: 1 },
    );
  });

  it('treats silence longer than the heartbeat timeout as a dead stream (D4)', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { logger } = connect(fake.url, { heartbeatTimeoutMs: 150 });

    await eventually(() => {
      expect(fake?.streamRequests()).toBeGreaterThanOrEqual(2);
    });
    expect(logger.at('warn')[0]?.fields.reason).toContain('no data from the decision service');
  });

  it('keeps the stream while pings arrive before the heartbeat timeout', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    connect(fake.url, { heartbeatTimeoutMs: 200 });
    await eventually(() => {
      expect(fake?.openStreams).toBe(1);
    });
    for (let index = 0; index < 6; index += 1) {
      await sleep(60);
      fake.ping();
    }
    expect(fake.streamRequests()).toBe(1);
  });

  it('retries a response that is not an event stream', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.wrongContentType = 'application/json';
    const { logger } = connect(fake.url);
    await eventually(() => {
      expect(fake?.streamRequests()).toBeGreaterThanOrEqual(2);
    });
    expect(logger.at('warn')[0]?.fields.reason).toBe('response is not an event stream');
  });

  it('close() aborts the stream, is idempotent and stops reconnecting', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    const { connection, states } = connect(fake.url);
    await eventually(() => {
      expect(fake?.openStreams).toBe(1);
    });

    await connection.close();
    await connection.close();
    expect(connection.state).toBe('closed');
    expect(states.at(-1)).toBe('closed');
    await eventually(() => {
      expect(fake?.openStreams).toBe(0);
    });
    await sleep(100);
    expect(fake.streamRequests()).toBe(1);
  });

  it('close() interrupts a pending backoff wait', async () => {
    fake = await FakeDecision.start({ config: testConfig(1) });
    fake.failWith = 503;
    const { connection } = connect(fake.url, { initialDelayMs: 60_000, maxDelayMs: 60_000 });
    await eventually(() => {
      expect(connection.state).toBe('disconnected');
    });
    const started = Date.now();
    await connection.close();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
