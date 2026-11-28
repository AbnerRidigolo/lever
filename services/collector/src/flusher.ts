import { SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import type { FastifyBaseLogger } from 'fastify';

import type { EventBuffer } from './buffer.js';
import type { Metrics } from './metrics.js';
import type { BronzeSink } from './sink.js';

export interface BackoffOptions {
  initialMs: number;
  maxMs: number;
}

export interface FlusherOptions {
  buffer: EventBuffer;
  sink: BronzeSink;
  metrics: Pick<Metrics, 'batchEvents' | 'sinkWriteDuration' | 'sinkFailures'>;
  logger: Pick<FastifyBaseLogger, 'warn' | 'error' | 'info'>;
  /** Time between flushes while the sink is healthy. */
  intervalMs: number;
  /** Most records in one write; an environment that reaches it is flushed without waiting. */
  maxEvents: number;
  /** Exponential retry delay after a failed flush; 500 ms to 30 s by default (collector plan, D5). */
  backoff?: BackoffOptions;
  /** Multiplier applied to each retry delay, in (0, 1]; random by default. Injectable for tests. */
  jitter?: () => number;
  /** Monotonic clock in milliseconds. */
  now?: () => number;
  tracer?: Tracer;
}

const DEFAULT_BACKOFF: BackoffOptions = { initialMs: 500, maxMs: 30_000 };

/**
 * Moves records from the buffer to the sink: one write per environment per flush, every
 * `intervalMs` or as soon as an environment holds `maxEvents`. A failed write leaves the records in
 * the buffer and the next attempt waits longer (exponential backoff with jitter); a successful
 * flush resets the delay. Records are committed only after the sink confirmed the write.
 */
export class Flusher {
  private readonly backoff: BackoffOptions;
  private readonly jitter: () => number;
  private readonly now: () => number;
  private readonly tracer: Tracer;

  private timer: NodeJS.Timeout | undefined;
  private current: Promise<boolean> | undefined;
  private consecutiveFailures = 0;
  private started = false;
  private stopping = false;
  private stopPromise: Promise<{ unflushed: number }> | undefined;

  constructor(private readonly options: FlusherOptions) {
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
    this.jitter = options.jitter ?? (() => 0.5 + Math.random() / 2);
    this.now = options.now ?? (() => performance.now());
    this.tracer = options.tracer ?? trace.getTracer('lever-collector');
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.buffer.onOffer(() => {
      this.flushEarlyIfFull();
    });
    this.schedule(this.anyEnvironmentFull() ? 0 : this.options.intervalMs);
  }

  /**
   * Stops the loop and tries to write what is buffered for up to `timeoutMs`. Returns how many
   * records could not be written; logs one error line with that count when it is not zero.
   */
  stop(timeoutMs: number): Promise<{ unflushed: number }> {
    // Idempotent: SIGTERM and SIGINT may both call it; later calls share the first one's result.
    this.stopPromise ??= this.doStop(timeoutMs);
    return this.stopPromise;
  }

  private async doStop(timeoutMs: number): Promise<{ unflushed: number }> {
    this.stopping = true;
    this.clearTimer();

    let abandoned = false;
    const isAbandoned = (): boolean => abandoned;
    let sleepTimer: NodeJS.Timeout | undefined;
    let deadlineTimer: NodeJS.Timeout | undefined;
    const buffer = this.options.buffer;

    const drain = async (): Promise<void> => {
      while (!abandoned && buffer.size() > 0) {
        if (await this.run(isAbandoned)) continue;
        if (isAbandoned()) break;
        await new Promise<void>((resolve) => {
          sleepTimer = setTimeout(resolve, this.retryDelayMs());
        });
      }
    };

    if (timeoutMs > 0) {
      const deadline = new Promise<void>((resolve) => {
        deadlineTimer = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([drain(), deadline]);
    }
    abandoned = true;
    clearTimeout(sleepTimer);
    clearTimeout(deadlineTimer);

    const unflushed = buffer.size();
    if (unflushed > 0) {
      this.options.logger.error({ unflushed }, 'shutdown with events still unwritten to the sink');
    }
    return { unflushed };
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    this.timer = undefined;
    await this.run(() => this.stopping);
    if (this.consecutiveFailures > 0) this.schedule(this.retryDelayMs());
    else this.schedule(this.anyEnvironmentFull() ? 0 : this.options.intervalMs);
  }

  /** Flushes at once when an environment is full, unless the sink is failing or a flush runs. */
  private flushEarlyIfFull(): void {
    if (this.stopping || this.current !== undefined || this.consecutiveFailures > 0) return;
    if (this.anyEnvironmentFull()) this.schedule(0);
  }

  private anyEnvironmentFull(): boolean {
    const { buffer, maxEvents } = this.options;
    return buffer.pendingEnvironments().some((id) => buffer.sizeOf(id) >= maxEvents);
  }

  private retryDelayMs(): number {
    const { initialMs, maxMs } = this.backoff;
    const exponent = Math.max(this.consecutiveFailures - 1, 0);
    return Math.min(maxMs, initialMs * 2 ** exponent) * this.jitter();
  }

  /**
   * One flush at a time: waits until none is running, then flushes. Two callers that waited on the
   * same flush must not both start the next one, so the wait is a loop. `cancelled` is checked
   * after the wait, because a stop may have returned meanwhile. True when every write worked.
   */
  private async run(cancelled: () => boolean): Promise<boolean> {
    while (this.current !== undefined) await this.current;
    if (cancelled()) return true;
    const flush: Promise<boolean> = this.flushOnce().finally(() => {
      if (this.current === flush) this.current = undefined;
    });
    this.current = flush;
    return flush;
  }

  private async flushOnce(): Promise<boolean> {
    const { buffer, maxEvents, logger } = this.options;
    let allWritten = true;

    for (const environmentId of buffer.pendingEnvironments()) {
      const records = buffer.peek(environmentId, maxEvents);
      if (records.length === 0) continue;
      try {
        await this.write(environmentId, records.length, () =>
          this.options.sink.write(environmentId, records),
        );
        buffer.commit(environmentId, records.length);
      } catch (error) {
        allWritten = false;
        this.options.metrics.sinkFailures.inc();
        logger.warn(
          { err: error, events: records.length, failures: this.consecutiveFailures + 1 },
          'bronze sink write failed, events kept for retry',
        );
      }
    }

    this.consecutiveFailures = allWritten ? 0 : this.consecutiveFailures + 1;
    return allWritten;
  }

  /** One span and one duration observation per write, whether it succeeds or fails. */
  private write(environmentId: string, count: number, write: () => Promise<void>): Promise<void> {
    return this.tracer.startActiveSpan(
      'bronze.write',
      { attributes: { 'lever.environment_id': environmentId, 'lever.events': count } },
      async (span) => {
        const started = this.now();
        try {
          await write();
          this.options.metrics.batchEvents.observe(count);
        } catch (error) {
          span.recordException(error instanceof Error ? error : String(error));
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          this.options.metrics.sinkWriteDuration.observe((this.now() - started) / 1000);
          span.end();
        }
      },
    );
  }
}
