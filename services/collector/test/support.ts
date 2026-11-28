import { randomUUID } from 'node:crypto';

import type { BronzeEventRecord } from '@lever/schemas';
import pino from 'pino';

import type { BronzeSink } from '../src/sink.js';

/** One bronze record of `environmentId`; `eventId` identifies it in assertions. */
export function record(environmentId: string, eventId: string = randomUUID()): BronzeEventRecord {
  return {
    event: {
      type: 'track',
      eventId,
      name: 'purchase',
      userId: 'user-1',
      timestamp: new Date().toISOString(),
      properties: {},
      sdk: { name: '@lever/sdk', version: '0.1.0' },
    },
    receivedAt: new Date().toISOString(),
    environmentId,
    apiKeyId: randomUUID(),
  };
}

export interface SinkWrite {
  environmentId: string;
  eventIds: string[];
}

/** In-memory sink; `failNext(n)` makes the next n writes reject. */
export class FakeSink implements BronzeSink {
  readonly writes: SinkWrite[] = [];
  attempts = 0;
  private failures = 0;
  private failAll = false;

  failNext(count: number): void {
    this.failures = count;
  }

  setDown(down: boolean): void {
    this.failAll = down;
  }

  write(environmentId: string, records: BronzeEventRecord[]): Promise<void> {
    this.attempts += 1;
    if (this.failAll || this.failures > 0) {
      if (this.failures > 0) this.failures -= 1;
      return Promise.reject(new Error('sink down'));
    }
    this.writes.push({ environmentId, eventIds: records.map((r) => r.event.eventId) });
    return Promise.resolve();
  }

  /** Event ids written for an environment, in write order. */
  written(environmentId: string): string[] {
    return this.writes.filter((w) => w.environmentId === environmentId).flatMap((w) => w.eventIds);
  }
}

/** A pino logger that keeps its lines, for asserting on what is logged. */
export function capturingLogger(): { logger: pino.Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    {
      write(chunk: string) {
        lines.push(JSON.parse(chunk) as Record<string, unknown>);
      },
    },
  );
  return { logger, lines };
}
