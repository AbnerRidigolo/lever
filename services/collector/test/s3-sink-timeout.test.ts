import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createS3Sink } from '../src/s3-sink.js';
import { record } from './support.js';

let server: Server;
let port: number;
const sockets = new Set<Socket>();

beforeAll(async () => {
  // Accepts connections and never answers: a half-open S3 endpoint.
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

describe('createS3Sink write timeout', () => {
  it('002/AC-2.6: a write to an endpoint that never answers rejects within the timeout', async () => {
    const environmentId = randomUUID();
    const sink = createS3Sink({
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucket: 'lake',
      forcePathStyle: true,
      writeTimeoutMs: 300,
    });

    const started = Date.now();
    await expect(sink.write(environmentId, [record(environmentId)])).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
  }, 15_000);
});
