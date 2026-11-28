import type { BronzeEventRecord } from '@lever/schemas';

/**
 * Where accepted records are durably written (the bronze layer). A resolved promise means the
 * records are stored; the flusher removes them from the buffer only then.
 */
export interface BronzeSink {
  write(environmentId: string, records: BronzeEventRecord[]): Promise<void>;
}
