import { describe, expect, it } from 'vitest';

import { Backoff } from '../src/backoff.js';

describe('exponential backoff (AC-5.5, D3)', () => {
  it('doubles the delay up to the cap', () => {
    const backoff = new Backoff({ initialDelayMs: 500, maxDelayMs: 30_000 }, () => 1);
    const delays = Array.from({ length: 9 }, () => backoff.next());
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(backoff.attempts).toBe(9);
  });

  it('waits between half the delay and the whole delay (equal jitter)', () => {
    const low = new Backoff({ initialDelayMs: 500, maxDelayMs: 30_000 }, () => 0);
    expect([low.next(), low.next(), low.next()]).toEqual([250, 500, 1_000]);

    const backoff = new Backoff({ initialDelayMs: 500, maxDelayMs: 30_000 });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delay = Math.min(30_000, 500 * 2 ** attempt);
      const wait = backoff.next();
      expect(wait).toBeGreaterThanOrEqual(delay / 2);
      expect(wait).toBeLessThanOrEqual(delay);
    }
  });

  it('goes back to the initial delay after a reset', () => {
    const backoff = new Backoff({ initialDelayMs: 100, maxDelayMs: 1_000 }, () => 1);
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.attempts).toBe(0);
    expect(backoff.next()).toBe(100);
  });

  it('never overflows after many failures', () => {
    const backoff = new Backoff({ initialDelayMs: 500, maxDelayMs: 30_000 }, () => 1);
    for (let attempt = 0; attempt < 2_000; attempt += 1) backoff.next();
    expect(backoff.next()).toBe(30_000);
  });
});
