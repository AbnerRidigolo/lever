import type { BronzeEventRecord } from '@lever/schemas';
import type { Gauge } from 'prom-client';

/** Where the ingest route hands accepted records; `false` means full (the route answers 503). */
export interface RecordQueue {
  offer(records: BronzeEventRecord[]): boolean;
}

export interface EventBufferOptions {
  /** Maximum records held, across environments. */
  maxEvents: number;
  /** Kept equal to `size()` after every change. */
  gauge?: Pick<Gauge, 'set'>;
}

/**
 * Bounded in-memory queue of accepted records, one FIFO per environment. Records leave only
 * through `commit`, after the sink confirmed the write, so a failed write loses nothing.
 */
export class EventBuffer implements RecordQueue {
  private readonly queues = new Map<string, BronzeEventRecord[]>();
  private total = 0;
  private listener: (() => void) | undefined;

  constructor(private readonly options: EventBufferOptions) {}

  /** All or nothing: a batch that does not fit is refused whole and nothing is stored. */
  offer(records: BronzeEventRecord[]): boolean {
    if (this.total + records.length > this.options.maxEvents) return false;
    for (const record of records) {
      const queue = this.queues.get(record.environmentId);
      if (queue === undefined) this.queues.set(record.environmentId, [record]);
      else queue.push(record);
    }
    this.total += records.length;
    this.options.gauge?.set(this.total);
    if (records.length > 0) this.listener?.();
    return true;
  }

  size(): number {
    return this.total;
  }

  sizeOf(environmentId: string): number {
    return this.queues.get(environmentId)?.length ?? 0;
  }

  /** Environments with records waiting, in order of first arrival. */
  pendingEnvironments(): string[] {
    return [...this.queues.keys()];
  }

  /** The oldest `max` records of an environment, without removing them. */
  peek(environmentId: string, max: number): BronzeEventRecord[] {
    return this.queues.get(environmentId)?.slice(0, max) ?? [];
  }

  /** Removes the oldest `count` records of an environment; call it only after a confirmed write. */
  commit(environmentId: string, count: number): void {
    const queue = this.queues.get(environmentId);
    if (queue === undefined) return;
    const removed = queue.splice(0, count).length;
    if (queue.length === 0) this.queues.delete(environmentId);
    this.total -= removed;
    this.options.gauge?.set(this.total);
  }

  /** Called after every accepted offer (the flusher uses it to flush full environments early). */
  onOffer(listener: () => void): void {
    this.listener = listener;
  }
}
