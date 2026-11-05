import { afterEach } from 'vitest';

import { createClient, defaultDeps, type ClientDeps, type LeverClient } from '../src/client.js';
import type { Evaluator } from '../src/evaluator.js';
import type { LeverClientOptions } from '../src/options.js';
import { capturingLogger, TEST_API_KEY, type CapturingLogger } from './helpers.js';

/**
 * Stand-in for the author's evaluation, used only by the tests (sdk plan, D13): serves the flag
 * value when the flag is on, always picks the control variant and puts every user in every
 * segment. It is not an implementation of the reserved logic.
 */
export const fakeEvaluator: Evaluator = {
  evaluateFlag: (flag) => (flag.enabled ? flag.servedValue : flag.defaultValue),
  evaluateExperiment: (experiment) =>
    experiment.variants.find((variant) => variant.isControl)?.key ?? 'control',
  matchesSegment: () => true,
};

export interface TestClient {
  client: LeverClient;
  logger: CapturingLogger;
}

const open: LeverClient[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((client) => client.close()));
});

/** A client on the internal factory with the fake evaluator; closed after each test. */
export function createTestClient(
  baseUrl: string,
  options: Partial<LeverClientOptions> = {},
  deps: Partial<ClientDeps> = {},
): TestClient {
  const logger = capturingLogger();
  const client = createClient(
    {
      apiKey: TEST_API_KEY,
      baseUrl,
      logger,
      backoff: { initialDelayMs: 10, maxDelayMs: 40 },
      ...options,
    },
    { ...defaultDeps, evaluator: fakeEvaluator, ...deps },
  );
  open.push(client);
  return { client, logger };
}
