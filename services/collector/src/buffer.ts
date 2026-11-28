import type { BronzeEventRecord } from '@lever/schemas';

/** Where the ingest route hands accepted records; `false` means full (the route answers 503). */
export interface RecordQueue {
  offer(records: BronzeEventRecord[]): boolean;
}
