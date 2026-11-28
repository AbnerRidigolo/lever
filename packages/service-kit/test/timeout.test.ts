import { describe, expect, it } from 'vitest';

import { withTimeout } from '../src/timeout.js';

describe('withTimeout', () => {
  it('resolves with the value of a promise that finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'work')).resolves.toBe(42);
  });

  it('rejects with the original error of a promise that fails in time', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100, 'work')).rejects.toThrow(
      'boom',
    );
  });

  it('wraps a non-Error rejection in an Error', async () => {
    // Testing that a non-Error rejection reason is wrapped.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    await expect(withTimeout(Promise.reject('plain'), 100, 'work')).rejects.toThrow('plain');
  });

  it('gives up with a descriptive error when the promise hangs', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'the lookup')).rejects.toThrow(
      'the lookup timed out after 20 ms',
    );
  });
});
