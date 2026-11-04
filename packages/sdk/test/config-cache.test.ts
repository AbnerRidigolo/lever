import { describe, expect, it } from 'vitest';

import { ConfigCache, parseStreamMessage } from '../src/config-cache.js';
import { testConfig } from './fixtures.js';

function clock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let time = start;
  return {
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
  };
}

describe('stream message validation (D8)', () => {
  it('accepts a valid config event', () => {
    const config = testConfig(4);
    const message = parseStreamMessage({ event: 'config', data: JSON.stringify(config), id: '4' });
    expect(message).toEqual({ kind: 'config', config });
  });

  it('accepts a ping', () => {
    expect(parseStreamMessage({ event: 'ping', data: '{}', id: undefined })).toEqual({
      kind: 'ping',
    });
  });

  it('ignores unknown events', () => {
    expect(parseStreamMessage({ event: 'message', data: 'x', id: undefined })).toEqual({
      kind: 'ignored',
      event: 'message',
    });
  });

  it('rejects data that is not JSON', () => {
    const message = parseStreamMessage({ event: 'config', data: '{oops', id: undefined });
    expect(message).toMatchObject({ kind: 'invalid', reason: 'data is not valid JSON' });
  });

  it('rejects a config that breaks the contract, without echoing the payload', () => {
    const broken = { ...testConfig(2), flags: [{ key: 'Secret Value', type: 'boolean' }] };
    const message = parseStreamMessage({ event: 'config', data: JSON.stringify(broken), id: '2' });
    expect(message.kind).toBe('invalid');
    expect(JSON.stringify(message)).not.toContain('Secret Value');
  });

  it('rejects a config with an unknown segment (environmentConfigSchema refinements)', () => {
    const config = testConfig(2);
    const broken = { ...config, segments: [] };
    expect(
      parseStreamMessage({ event: 'config', data: JSON.stringify(broken), id: '2' }).kind,
    ).toBe('invalid');
  });

  it('rejects a ping with a payload', () => {
    expect(parseStreamMessage({ event: 'ping', data: '{"a":1}', id: undefined }).kind).toBe(
      'invalid',
    );
  });
});

describe('config cache (AC-5.6, D4, D11)', () => {
  it('starts empty, without version or age', () => {
    const cache = new ConfigCache(clock().now);
    expect(cache.current).toBeNull();
    expect(cache.ageMs()).toBeNull();
  });

  it('indexes flags, experiments and segments by key', () => {
    const cache = new ConfigCache(clock().now);
    expect(cache.apply(testConfig(1))).toBe('applied');
    const loaded = cache.current;
    expect(loaded?.version).toBe(1);
    expect(loaded?.flags.get('new-banner')?.type).toBe('boolean');
    expect(loaded?.experiments.get('checkout-layout')?.status).toBe('running');
    expect(loaded?.segments.get('brazil')?.rules.conditions).toHaveLength(1);
  });

  it('only moves forward: same and older versions keep the current config', () => {
    const cache = new ConfigCache(clock().now);
    cache.apply(testConfig(5));
    const current = cache.current;
    expect(cache.apply(testConfig(5))).toBe('same');
    expect(cache.apply(testConfig(3))).toBe('older');
    expect(cache.current).toBe(current);
    expect(cache.apply(testConfig(6))).toBe('applied');
    expect(cache.current?.version).toBe(6);
  });

  it('measures the age since the server last confirmed the config', () => {
    const time = clock();
    const cache = new ConfigCache(time.now);
    cache.markFresh();
    expect(cache.ageMs()).toBeNull();

    cache.apply(testConfig(1));
    time.advance(2_000);
    expect(cache.ageMs()).toBe(2_000);

    cache.markFresh();
    time.advance(500);
    expect(cache.ageMs()).toBe(500);

    cache.apply(testConfig(1));
    expect(cache.ageMs()).toBe(0);
  });
});
