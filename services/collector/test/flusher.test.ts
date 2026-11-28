import { randomUUID } from 'node:crypto';

import { SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBuffer } from '../src/buffer.js';
import { Flusher, type FlusherOptions } from '../src/flusher.js';
import { createMetrics, type Metrics } from '../src/metrics.js';

import { capturingLogger, FakeSink, record } from './support.js';

const ENV_A = randomUUID();
const ENV_B = randomUUID();

let sink: FakeSink;
let metrics: Metrics;

beforeEach(() => {
  vi.useFakeTimers();
  sink = new FakeSink();
  metrics = createMetrics();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(
  options: { bufferMax?: number } & Partial<
    Omit<FlusherOptions, 'buffer' | 'sink' | 'metrics'>
  > = {},
) {
  const { bufferMax = 1000, ...flusherOptions } = options;
  const buffer = new EventBuffer({ maxEvents: bufferMax, gauge: metrics.bufferEvents });
  const { logger, lines } = capturingLogger();
  const flusher = new Flusher({
    buffer,
    sink,
    metrics,
    logger,
    intervalMs: 1000,
    maxEvents: 5000,
    jitter: () => 1,
    ...flusherOptions,
  });
  return { buffer, flusher, lines };
}

/** The value of a sample line, e.g. `x_total` or a histogram's `x_count` / `x_sum`. */
const metricValue = async (sample: string): Promise<number> => {
  const base = sample.replace(/_(count|sum)$/, '');
  const text = await metrics.registry.getSingleMetricAsString(base);
  const line = text.split('\n').find((l) => l.startsWith(`${sample} `));
  return line === undefined ? 0 : Number(line.split(' ').pop());
};

describe('Flusher', () => {
  it('002/AC-2.6: keeps accepted events while the sink is down and writes them when it returns', async () => {
    const { buffer, flusher } = setup();
    const ids = ['e1', 'e2', 'e3', 'e4'];
    buffer.offer(ids.slice(0, 2).map((id) => record(ENV_A, id)));
    buffer.offer(ids.slice(2).map((id) => record(ENV_A, id)));
    sink.failNext(3);
    flusher.start();

    // Attempts at 1 s, then backoff of 500 ms, 1 s and 2 s.
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.attempts).toBe(1);
    expect(buffer.size()).toBe(4);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.attempts).toBe(3);
    expect(sink.writes).toEqual([]);
    expect(buffer.size()).toBe(4);
    await vi.advanceTimersByTimeAsync(2000);

    expect(sink.written(ENV_A)).toEqual(ids);
    expect(buffer.size()).toBe(0);
    expect(await metricValue('lever_collector_sink_failures_total')).toBe(3);
    await flusher.stop(100);
  });

  it('flushes every interval or when an environment reaches the max events', async () => {
    const { buffer, flusher } = setup({ maxEvents: 3 });
    flusher.start();

    buffer.offer([record(ENV_A, 'a1')]);
    await vi.advanceTimersByTimeAsync(999);
    expect(sink.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sink.written(ENV_A)).toEqual(['a1']);

    // Reaching max events flushes at once, without waiting for the interval.
    buffer.offer([record(ENV_A, 'a2'), record(ENV_A, 'a3'), record(ENV_A, 'a4')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.written(ENV_A)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(buffer.size()).toBe(0);
    await flusher.stop(100);
  });

  it('writes one object per environment per flush, at most max events each', async () => {
    const { buffer, flusher } = setup({ maxEvents: 2 });
    buffer.offer([
      record(ENV_A, 'a1'),
      record(ENV_B, 'b1'),
      record(ENV_A, 'a2'),
      record(ENV_A, 'a3'),
    ]);
    flusher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sink.writes.slice(0, 2)).toEqual([
      { environmentId: ENV_A, eventIds: ['a1', 'a2'] },
      { environmentId: ENV_B, eventIds: ['b1'] },
    ]);
    // The remainder goes in the next flush, still one object per environment.
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.writes).toHaveLength(3);
    expect(sink.writes[2]).toEqual({ environmentId: ENV_A, eventIds: ['a3'] });
    expect(await metricValue('lever_collector_batch_events_count')).toBe(3);
    expect(await metricValue('lever_collector_batch_events_sum')).toBe(4);
    await flusher.stop(100);
  });

  it('keeps writing other environments when one write fails', async () => {
    const { buffer, flusher } = setup();
    buffer.offer([record(ENV_A, 'a1'), record(ENV_B, 'b1')]);
    sink.failNext(1);
    flusher.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.written(ENV_B)).toEqual(['b1']);
    expect(buffer.peek(ENV_A, 10)).toHaveLength(1);
    await flusher.stop(100);
  });

  it('retries with exponential backoff capped at 30 s', async () => {
    const { buffer, flusher } = setup({
      backoff: { initialMs: 500, maxMs: 30_000 },
      intervalMs: 100,
    });
    buffer.offer([record(ENV_A)]);
    sink.setDown(true);
    flusher.start();

    const expectedDelays = [100, 500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];
    let attempts = 0;
    for (const delay of expectedDelays) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(sink.attempts).toBe(attempts);
      await vi.advanceTimersByTimeAsync(1);
      attempts += 1;
      expect(sink.attempts).toBe(attempts);
    }
    await flusher.stop(0);
  });

  it('applies jitter to the backoff delay', async () => {
    const { buffer, flusher } = setup({ jitter: () => 0.5, intervalMs: 100 });
    buffer.offer([record(ENV_A)]);
    sink.setDown(true);
    flusher.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(sink.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(sink.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sink.attempts).toBe(2);
    await flusher.stop(0);
  });

  it('on stop, flushes what is buffered', async () => {
    const { buffer, flusher, lines } = setup();
    buffer.offer([record(ENV_A, 'a1'), record(ENV_B, 'b1')]);
    flusher.start();
    const result = await flusher.stop(1000);
    expect(result).toEqual({ unflushed: 0 });
    expect(sink.written(ENV_A)).toEqual(['a1']);
    expect(sink.written(ENV_B)).toEqual(['b1']);
    expect(lines.filter((l) => l.level === 50)).toEqual([]);
  });

  it('on stop, reports what it could not write', async () => {
    const { buffer, flusher, lines } = setup();
    buffer.offer([record(ENV_A), record(ENV_A), record(ENV_B)]);
    sink.setDown(true);
    flusher.start();
    const stopped = flusher.stop(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await stopped).toEqual({ unflushed: 3 });

    const errors = lines.filter((l) => l.level === 50);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ unflushed: 3 });
    // No event data or ids in the line.
    expect(JSON.stringify(errors[0])).not.toContain(ENV_A);
    expect(JSON.stringify(errors[0])).not.toContain('user-1');
  });

  it('on stop, gives up on a write that never returns', async () => {
    const { buffer, flusher } = setup();
    buffer.offer([record(ENV_A)]);
    sink.write = () => new Promise(() => undefined);
    flusher.start();
    await vi.advanceTimersByTimeAsync(1000);
    const stopped = flusher.stop(200);
    await vi.advanceTimersByTimeAsync(200);
    expect(await stopped).toEqual({ unflushed: 1 });
  });

  it('records a span per sink write and the failure on it', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const { buffer, flusher } = setup({ tracer: provider.getTracer('test') });
    buffer.offer([record(ENV_A)]);
    sink.failNext(1);
    flusher.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0]?.name).toBe('bronze.write');
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.events.some((e) => e.name === 'exception')).toBe(true);
    expect(spans[1]?.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(spans[1]?.attributes['lever.events']).toBe(1);
    await flusher.stop(100);
  });

  it('observes the sink write duration', async () => {
    const { buffer, flusher } = setup();
    buffer.offer([record(ENV_A)]);
    flusher.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await metricValue('lever_collector_sink_write_duration_seconds_count')).toBe(1);
    await flusher.stop(100);
  });

  describe('concurrency', () => {
    /** Makes the next sink write wait until `release()` is called. */
    function gateNextWrite(): { release: () => void } {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = sink.write.bind(sink);
      let gated = false;
      sink.write = async (environmentId, records) => {
        if (!gated) {
          gated = true;
          await gate;
        }
        return original(environmentId, records);
      };
      return { release };
    }

    it('two concurrent stops while a slow write is in flight write every record exactly once', async () => {
      const { buffer, flusher } = setup();
      buffer.offer([record(ENV_A, 'a1'), record(ENV_A, 'a2')]);
      const slow = gateNextWrite();
      flusher.start();
      await vi.advanceTimersByTimeAsync(1000);

      // Accepted while the first flush is in flight.
      buffer.offer([record(ENV_A, 'a3'), record(ENV_A, 'a4')]);
      const first = flusher.stop(5000);
      const second = flusher.stop(5000);
      slow.release();
      await vi.advanceTimersByTimeAsync(0);

      expect(await first).toEqual({ unflushed: 0 });
      expect(await second).toEqual({ unflushed: 0 });
      expect(sink.written(ENV_A)).toEqual(['a1', 'a2', 'a3', 'a4']);
      expect(buffer.size()).toBe(0);
    });

    it('records offered during an in-flight write are kept and written once', async () => {
      const { buffer, flusher } = setup();
      buffer.offer([record(ENV_A, 'a1')]);
      const slow = gateNextWrite();
      flusher.start();
      await vi.advanceTimersByTimeAsync(1000);
      buffer.offer([record(ENV_A, 'a2')]);
      expect(buffer.size()).toBe(2);
      slow.release();
      await vi.advanceTimersByTimeAsync(0);
      expect(buffer.size()).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sink.written(ENV_A)).toEqual(['a1', 'a2']);
      expect(buffer.size()).toBe(0);
      await flusher.stop(100);
    });

    it('does not write after stop returned, even if the hung write settles later', async () => {
      const { buffer, flusher } = setup();
      buffer.offer([record(ENV_A, 'a1')]);
      const slow = gateNextWrite();
      flusher.start();
      await vi.advanceTimersByTimeAsync(1000);
      buffer.offer([record(ENV_A, 'a2')]);
      const stopped = flusher.stop(100);
      await vi.advanceTimersByTimeAsync(100);
      expect(await stopped).toEqual({ unflushed: 2 });

      const attempts = sink.attempts;
      slow.release();
      await vi.advanceTimersByTimeAsync(5000);
      // Only the write that was already in flight completes; nothing new starts.
      expect(sink.attempts).toBe(attempts + 1);
    });
  });
});
