import { afterEach } from 'vitest';

import { Backoff } from '../src/backoff.js';
import { parseStreamMessage, type StreamMessage } from '../src/config-cache.js';
import { StreamConnection, type ConnectionState } from '../src/connection.js';
import { capturingLogger, TEST_API_KEY, type CapturingLogger } from './helpers.js';

export interface TestConnection {
  connection: StreamConnection;
  messages: StreamMessage[];
  states: ConnectionState[];
  logger: CapturingLogger;
  backoff: Backoff;
}

const open: StreamConnection[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((connection) => connection.close()));
});

/** A started stream connection that records messages and states; closed after each test. */
export function connect(
  baseUrl: string,
  { heartbeatTimeoutMs = 5_000, initialDelayMs = 10, maxDelayMs = 40, apiKey = TEST_API_KEY } = {},
): TestConnection {
  const logger = capturingLogger();
  const messages: StreamMessage[] = [];
  const states: ConnectionState[] = [];
  const backoff = new Backoff({ initialDelayMs, maxDelayMs });
  const connection = new StreamConnection({
    baseUrl,
    apiKey,
    heartbeatTimeoutMs,
    backoff,
    logger,
    onMessage: (message) => {
      const parsed = parseStreamMessage(message);
      messages.push(parsed);
      return parsed.kind === 'config';
    },
    onStateChange: (state) => states.push(state),
  });
  open.push(connection);
  connection.start();
  return { connection, messages, states, logger, backoff };
}
