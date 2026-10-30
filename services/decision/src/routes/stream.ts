import type { ServerResponse } from 'node:http';

import type { EnvironmentConfig, StreamEvent } from '@lever/schemas';
import type { FastifyPluginAsync } from 'fastify';

import { authOf } from '../auth/api-key-auth.js';
import type { ConfigStore } from '../config/config-store.js';

export interface StreamRoutesOptions {
  configStore: ConfigStore;
  pingIntervalMs: number;
  /** Called with +1 when a client connects and -1 when it leaves (for metrics). */
  onClientsChange?: (environmentId: string, delta: 1 | -1) => void;
}

/** Serializes an event in the Server-Sent Events wire format. */
export function formatStreamEvent(event: StreamEvent): string {
  const id = event.event === 'config' ? `id: ${event.data.version}\n` : '';
  return `event: ${event.event}\n${id}data: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * `GET /v1/stream` (FR-006): sends the current configuration on connect, a new `config`
 * event for every newer version of the environment and a `ping` every interval.
 */
export const streamRoutes: FastifyPluginAsync<StreamRoutesOptions> = (app, options) => {
  const { configStore, pingIntervalMs, onClientsChange } = options;
  const open = new Set<ServerResponse>();

  // End open streams before the server stops accepting connections.
  app.addHook('preClose', async () => {
    for (const response of open) response.end();
    open.clear();
    return Promise.resolve();
  });

  app.get('/stream', async (request, reply) => {
    const { environmentId } = authOf(request);
    // Fails with the standard JSON error (e.g. 503) before the stream starts.
    const initial = await configStore.get(environmentId);

    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    let sentVersion = 0;
    const sendConfig = (config: EnvironmentConfig): void => {
      if (config.version <= sentVersion) return;
      sentVersion = config.version;
      response.write(formatStreamEvent({ event: 'config', data: config }));
    };

    sendConfig(initial);
    const unsubscribe = configStore.subscribe((update) => {
      if (update.environmentId === environmentId) sendConfig(update.config);
    });
    const ping = setInterval(() => {
      response.write(formatStreamEvent({ event: 'ping', data: {} }));
    }, pingIntervalMs);

    open.add(response);
    onClientsChange?.(environmentId, 1);
    request.log.debug({ environmentId }, 'stream opened');

    response.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      open.delete(response);
      onClientsChange?.(environmentId, -1);
      request.log.debug({ environmentId }, 'stream closed');
    });
  });

  return Promise.resolve();
};
