import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const execFileAsync = promisify(execFile);

/** Same image and fictitious credentials as `infra/docker-compose.yml` and `.env.example`. */
const SEAWEEDFS_IMAGE = 'chrislusf/seaweedfs:4.53';
export const TEST_ACCESS_KEY = 'lever-local-access-key';
export const TEST_SECRET_KEY = 'lever-local-secret-key';
export const TEST_REGION = 'us-east-1';

export interface TestSeaweedfs {
  endpoint: string;
  bucket: string;
  client: S3Client;
  /** Stops the container but keeps it (and its data) so `start` can bring it back. */
  stop(): Promise<void>;
  /** Starts a stopped container; the host port is fixed, so `endpoint` stays valid. */
  start(): Promise<void>;
  close(): Promise<void>;
}

/** A free host port; bound explicitly so the endpoint survives a container stop and start. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('no port'));
        return;
      }
      server.close(() => {
        resolve(address.port);
      });
    });
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Retries `action` until it succeeds or `timeoutMs` passes (SeaweedFS needs a moment after start). */
async function retry<T>(action: () => Promise<T>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await action();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(500);
    }
  }
}

export function s3ClientFor(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: TEST_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_ACCESS_KEY, secretAccessKey: TEST_SECRET_KEY },
    maxAttempts: 1,
  });
}

/**
 * Starts a real SeaweedFS with its S3 gateway and creates `bucket`. No probe runs inside the
 * container (base-002 lesson: `localhost` there may resolve to IPv6); readiness is a log line plus
 * retrying the bucket creation through the SDK.
 */
export async function startSeaweedfs(bucket = 'lever-lake'): Promise<TestSeaweedfs> {
  const hostPort = await freePort();
  const container: StartedTestContainer = await new GenericContainer(SEAWEEDFS_IMAGE)
    .withCommand(['server', '-dir=/data', '-s3', '-s3.port=8333'])
    .withEnvironment({ AWS_ACCESS_KEY_ID: TEST_ACCESS_KEY, AWS_SECRET_ACCESS_KEY: TEST_SECRET_KEY })
    .withExposedPorts({ container: 8333, host: hostPort })
    .withWaitStrategy(Wait.forLogMessage(/Start Seaweed S3 API Server/))
    .withStartupTimeout(120_000)
    .start();

  const endpoint = `http://127.0.0.1:${hostPort}`;
  const client = s3ClientFor(endpoint);
  await retry(() => client.send(new CreateBucketCommand({ Bucket: bucket })), 90_000);

  return {
    endpoint,
    bucket,
    client,
    stop: async () => {
      await execFileAsync('docker', ['stop', container.getId()]);
    },
    start: async () => {
      await execFileAsync('docker', ['start', container.getId()]);
    },
    close: async () => {
      client.destroy();
      await container.stop();
    },
  };
}

export interface StoredObject {
  key: string;
  body: Buffer;
}

/** Lists every object under `prefix` and returns its raw (still compressed) body. */
export async function readObjects(
  client: S3Client,
  bucket: string,
  prefix = '',
): Promise<StoredObject[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) if (item.Key !== undefined) keys.push(item.Key);
    token = page.NextContinuationToken;
  } while (token !== undefined);

  return Promise.all(
    keys.map(async (key) => {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (response.Body === undefined) throw new Error(`empty body for ${key}`);
      return { key, body: Buffer.from(await response.Body.transformToByteArray()) };
    }),
  );
}

export { retry };
