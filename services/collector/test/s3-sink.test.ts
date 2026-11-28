import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { bronzeEventRecordSchema } from '@lever/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createS3Sink } from '../src/s3-sink.js';
import { record } from './support.js';
import {
  TEST_ACCESS_KEY,
  TEST_REGION,
  TEST_SECRET_KEY,
  readObjects,
  startSeaweedfs,
  type TestSeaweedfs,
} from './seaweedfs.js';

let storage: TestSeaweedfs;

beforeAll(async () => {
  storage = await startSeaweedfs();
}, 240_000);

afterAll(async () => {
  await storage.close();
});

function sinkAt(now: () => Date) {
  return createS3Sink({
    endpoint: storage.endpoint,
    region: TEST_REGION,
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    bucket: storage.bucket,
    forcePathStyle: true,
    now,
  });
}

function recordAt(environmentId: string, receivedAt: string) {
  return { ...record(environmentId), receivedAt };
}

describe('createS3Sink', () => {
  it('002/AC-3.1: writes raw records partitioned by environment and received date', async () => {
    const environmentId = randomUUID();
    const records = [record(environmentId), record(environmentId)].map((r) => ({
      ...r,
      receivedAt: '2026-11-27T10:00:00.000Z',
    }));
    const sink = sinkAt(() => new Date('2026-11-27T10:00:01.000Z'));

    await sink.write(environmentId, records);

    const prefix = `bronze/events_raw/environment_id=${environmentId}/received_date=2026-11-27/`;
    const objects = await readObjects(storage.client, storage.bucket, prefix);
    expect(objects).toHaveLength(1);
    const [object] = objects;
    expect(object?.key).toMatch(
      new RegExp(`^${prefix}\\d{8}T\\d{9}Z-[0-9a-f-]{36}\\.ndjson\\.gz$`),
    );

    const lines = gunzipSync(object?.body ?? Buffer.alloc(0))
      .toString('utf8')
      .split('\n');
    expect(lines.at(-1)).toBe('');
    const parsed = lines
      .slice(0, -1)
      .map((line) => bronzeEventRecordSchema.parse(JSON.parse(line)));
    expect(parsed).toEqual(records);
  });

  it('002/AC-3.1: sets the NDJSON content type and the gzip content encoding', async () => {
    const environmentId = randomUUID();
    await sinkAt(() => new Date('2026-11-27T10:00:01.000Z')).write(environmentId, [
      recordAt(environmentId, '2026-11-27T10:00:00.000Z'),
    ]);
    const [object] = await readObjects(
      storage.client,
      storage.bucket,
      `bronze/events_raw/environment_id=${environmentId}/`,
    );
    const head = await storage.client.send(
      new HeadObjectCommand({ Bucket: storage.bucket, Key: object?.key ?? '' }),
    );
    expect(head.ContentType).toBe('application/x-ndjson');
    expect(head.ContentEncoding).toBe('gzip');
  });

  it('002/AC-3.1: a write that spans midnight is split by received date', async () => {
    const environmentId = randomUUID();
    const before = recordAt(environmentId, '2026-11-27T23:59:59.900Z');
    const after = recordAt(environmentId, '2026-11-28T00:00:00.100Z');

    await sinkAt(() => new Date('2026-11-28T00:00:01.000Z')).write(environmentId, [before, after]);

    const base = `bronze/events_raw/environment_id=${environmentId}/`;
    const day27 = await readObjects(
      storage.client,
      storage.bucket,
      `${base}received_date=2026-11-27/`,
    );
    const day28 = await readObjects(
      storage.client,
      storage.bucket,
      `${base}received_date=2026-11-28/`,
    );
    expect(day27).toHaveLength(1);
    expect(day28).toHaveLength(1);
    expect(gunzipSync(day27[0]?.body ?? Buffer.alloc(0)).toString()).toContain(
      before.event.eventId,
    );
    expect(gunzipSync(day28[0]?.body ?? Buffer.alloc(0)).toString()).toContain(after.event.eventId);
  });

  it('writes nothing for an empty batch', async () => {
    const environmentId = randomUUID();
    await sinkAt(() => new Date()).write(environmentId, []);
    const objects = await readObjects(
      storage.client,
      storage.bucket,
      `bronze/events_raw/environment_id=${environmentId}/`,
    );
    expect(objects).toEqual([]);
  });

  it('rejects when the storage is unreachable', async () => {
    const sink = createS3Sink({
      endpoint: 'http://127.0.0.1:1',
      region: TEST_REGION,
      accessKeyId: TEST_ACCESS_KEY,
      secretAccessKey: TEST_SECRET_KEY,
      bucket: storage.bucket,
      forcePathStyle: true,
    });
    const environmentId = randomUUID();
    await expect(sink.write(environmentId, [record(environmentId)])).rejects.toThrow();
  });
});
