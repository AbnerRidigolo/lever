import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  it('redacts the authorization header and names the service', () => {
    const lines: string[] = [];
    const logger = createLogger('lever-test', 'info', {
      write: (line: string) => lines.push(line),
    });

    logger.info({ req: { headers: { authorization: 'Bearer lvr_dev_secret' } } }, 'request');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('lvr_dev_secret');
    expect(lines[0]).toContain('[redacted]');
    expect(lines[0]).toContain('"service":"lever-test"');
  });
});
