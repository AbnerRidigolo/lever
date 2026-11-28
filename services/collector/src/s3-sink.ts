import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { BronzeEventRecord } from '@lever/schemas';

import type { BronzeSink } from './sink.js';

const gzipAsync = promisify(gzip);

export interface S3SinkOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Path-style addressing; required for SeaweedFS (no bucket subdomains). */
  forcePathStyle: boolean;
  /**
   * Upper bound for one object write (connect, send and response together). Without it a
   * half-open connection never settles and the flusher would wait forever (default 10 s).
   */
  writeTimeoutMs?: number;
  /** Clock for the object-name timestamp; injectable for tests. */
  now?: () => Date;
}

const KEY_PREFIX = 'bronze/events_raw';
const DEFAULT_WRITE_TIMEOUT_MS = 10_000;

/** `20261127T100001123Z`: sortable, UTC, milliseconds, no characters that need escaping. */
function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '');
}

/**
 * Writes accepted records to the bronze layer as gzip NDJSON objects (collector plan, D2):
 * `bronze/events_raw/environment_id=<uuid>/received_date=<YYYY-MM-DD>/<timestamp>-<uuid>.ndjson.gz`.
 *
 * The partition date is the UTC date of each record's `receivedAt`. A write whose records span
 * midnight is split into one object per date, so a record always lands in the partition of the day
 * it was received. Objects are only ever created, never changed (002/AC-3.1). `write` resolves only
 * after every object was stored; if one fails it rejects and the caller retries the whole batch,
 * which may leave a duplicated object for the dates that already succeeded. Duplicates are removed
 * by `eventId` in the silver layer (ADR-007); the collector never deduplicates.
 */
export function createS3Sink(options: S3SinkOptions): BronzeSink {
  const now = options.now ?? (() => new Date());
  const writeTimeoutMs = options.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS;
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    // One attempt, bounded: the flusher owns retries (with backoff), so the SDK must not retry
    // inside its own, unbounded loop.
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: writeTimeoutMs,
      requestTimeout: writeTimeoutMs,
      throwOnRequestTimeout: true,
    },
  });

  async function putObject(
    environmentId: string,
    receivedDate: string,
    records: BronzeEventRecord[],
  ): Promise<void> {
    const ndjson = records.map((record) => `${JSON.stringify(record)}\n`).join('');
    const body = await gzipAsync(ndjson);
    const key =
      `${KEY_PREFIX}/environment_id=${environmentId}/received_date=${receivedDate}/` +
      `${compactTimestamp(now())}-${randomUUID()}.ndjson.gz`;
    await client.send(
      new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/x-ndjson',
        ContentEncoding: 'gzip',
      }),
      // Covers the whole attempt, including a connection that stays half-open.
      { abortSignal: AbortSignal.timeout(writeTimeoutMs) },
    );
  }

  return {
    async write(environmentId, records) {
      const byDate = new Map<string, BronzeEventRecord[]>();
      for (const record of records) {
        const date = new Date(record.receivedAt).toISOString().slice(0, 10);
        const group = byDate.get(date);
        if (group === undefined) byDate.set(date, [record]);
        else group.push(record);
      }
      for (const [date, group] of byDate) await putObject(environmentId, date, group);
    },
  };
}
