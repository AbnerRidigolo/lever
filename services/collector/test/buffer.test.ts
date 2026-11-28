import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EventBuffer } from '../src/buffer.js';
import { createMetrics } from '../src/metrics.js';

import { record } from './support.js';

const ENV_A = randomUUID();
const ENV_B = randomUUID();

describe('EventBuffer', () => {
  it('002/AC-2.6: offer is all or nothing and never drops what was accepted', () => {
    const buffer = new EventBuffer({ maxEvents: 10 });
    expect(buffer.offer(Array.from({ length: 8 }, () => record(ENV_A)))).toBe(true);
    expect(buffer.offer([record(ENV_A), record(ENV_A), record(ENV_A)])).toBe(false);
    expect(buffer.size()).toBe(8);
    expect(buffer.offer([record(ENV_A), record(ENV_B)])).toBe(true);
    expect(buffer.size()).toBe(10);
  });

  it('peek does not remove; commit removes from the head, in order, per environment', () => {
    const buffer = new EventBuffer({ maxEvents: 100 });
    buffer.offer([record(ENV_A, 'a1'), record(ENV_B, 'b1'), record(ENV_A, 'a2')]);
    buffer.offer([record(ENV_A, 'a3')]);

    expect(buffer.peek(ENV_A, 2).map((r) => r.event.eventId)).toEqual(['a1', 'a2']);
    expect(buffer.peek(ENV_A, 10).map((r) => r.event.eventId)).toEqual(['a1', 'a2', 'a3']);
    expect(buffer.size()).toBe(4);

    buffer.commit(ENV_A, 2);
    expect(buffer.peek(ENV_A, 10).map((r) => r.event.eventId)).toEqual(['a3']);
    expect(buffer.size()).toBe(2);
    expect(buffer.pendingEnvironments()).toEqual([ENV_A, ENV_B]);

    buffer.commit(ENV_A, 5);
    buffer.commit(ENV_B, 1);
    expect(buffer.size()).toBe(0);
    expect(buffer.pendingEnvironments()).toEqual([]);
    expect(buffer.peek(ENV_A, 10)).toEqual([]);
  });

  it('reports its size to the buffer gauge', async () => {
    const metrics = createMetrics();
    const buffer = new EventBuffer({ maxEvents: 10, gauge: metrics.bufferEvents });
    buffer.offer([record(ENV_A), record(ENV_A)]);
    expect(
      await metrics.registry.getSingleMetricAsString('lever_collector_buffer_events'),
    ).toContain('lever_collector_buffer_events 2');
    buffer.commit(ENV_A, 2);
    expect(
      await metrics.registry.getSingleMetricAsString('lever_collector_buffer_events'),
    ).toContain('lever_collector_buffer_events 0');
  });

  it('notifies the listener after each accepted offer and not after a refused one', () => {
    const buffer = new EventBuffer({ maxEvents: 2 });
    let calls = 0;
    buffer.onOffer(() => {
      calls += 1;
    });
    buffer.offer([record(ENV_A)]);
    buffer.offer([record(ENV_A), record(ENV_A)]);
    expect(calls).toBe(1);
  });
});
