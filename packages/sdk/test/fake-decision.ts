import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

import {
  createApiError,
  type EnvironmentConfig,
  type ErrorCode,
  type StreamEvent,
} from '@lever/schemas';

import { TEST_API_KEY } from './helpers.js';

export interface FakeDecisionOptions {
  /** Configuration sent on connect; null answers 503 like the real service without config. */
  config?: EnvironmentConfig | null;
  /** Port to listen on (0 picks a free one). */
  port?: number;
}

const ERROR_CODE_BY_STATUS: Record<number, ErrorCode> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
  500: 'internal',
  503: 'service_unavailable',
};

/** Same wire format as `services/decision/src/routes/stream.ts`. */
export function formatEvent(event: StreamEvent): string {
  const id = event.event === 'config' ? `id: ${event.data.version}\n` : '';
  return `event: ${event.event}\n${id}data: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * A real HTTP server (real sockets, no mocked network) that speaks the decision service
 * contract of spec 001 section 8 and lets the tests inject failures (sdk plan, D12).
 */
export class FakeDecision {
  /** Every request received, in order. */
  readonly requests: { path: string; authorization: string | undefined }[] = [];
  config: EnvironmentConfig | null;
  /** When set, every request is answered with this status and a standard error body. */
  failWith: number | null = null;
  /** When set, the stream answers 200 with this content type and a plain body. */
  wrongContentType: string | null = null;

  private server: Server;
  private readonly streams = new Set<ServerResponse>();
  private readonly sockets = new Set<Socket>();
  private currentPort: number;

  private constructor(options: FakeDecisionOptions) {
    this.config = options.config === undefined ? null : options.config;
    this.currentPort = options.port ?? 0;
    this.server = this.createHttpServer();
  }

  static async start(options: FakeDecisionOptions = {}): Promise<FakeDecision> {
    const fake = new FakeDecision(options);
    await fake.listen();
    return fake;
  }

  get port(): number {
    return this.currentPort;
  }

  get url(): string {
    return `http://127.0.0.1:${this.currentPort}`;
  }

  get openStreams(): number {
    return this.streams.size;
  }

  streamRequests(): number {
    return this.requests.filter((request) => request.path === '/v1/stream').length;
  }

  /** Sets the configuration and sends it to every open stream. */
  pushConfig(config: EnvironmentConfig): void {
    this.config = config;
    this.broadcast(formatEvent({ event: 'config', data: config }));
  }

  ping(): void {
    this.broadcast(formatEvent({ event: 'ping', data: {} }));
  }

  /** Writes raw text to every open stream (invalid events, comments...). */
  broadcast(text: string): void {
    for (const response of this.streams) response.write(text);
  }

  /** Ends every open stream, as a crash or a proxy timeout would. */
  dropStreams(): void {
    for (const response of this.streams) response.destroy();
    this.streams.clear();
  }

  /** Stops listening and drops every connection; `restart` listens again on the same port. */
  async stop(): Promise<void> {
    this.dropStreams();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      });
    });
  }

  async restart(): Promise<void> {
    this.server = this.createHttpServer();
    await this.listen();
  }

  private async listen(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(this.currentPort, '127.0.0.1', resolve);
    });
    this.currentPort = (this.server.address() as AddressInfo).port;
  }

  private createHttpServer(): Server {
    const server = createServer((request, response) => {
      this.handle(request, response);
    });
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    return server;
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const path = request.url ?? '';
    this.requests.push({ path, authorization: request.headers.authorization });

    if (this.failWith !== null) {
      this.sendError(response, this.failWith);
      return;
    }
    if (request.headers.authorization !== `Bearer ${TEST_API_KEY}`) {
      this.sendError(response, 401);
      return;
    }
    if (path === '/v1/config') {
      if (this.config === null) this.sendError(response, 503);
      else this.sendJson(response, 200, this.config);
      return;
    }
    if (path !== '/v1/stream') {
      this.sendError(response, 404);
      return;
    }
    if (this.wrongContentType !== null) {
      response.writeHead(200, { 'content-type': this.wrongContentType });
      response.end('not a stream');
      return;
    }
    if (this.config === null) {
      this.sendError(response, 503);
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    response.write(formatEvent({ event: 'config', data: this.config }));
    this.streams.add(response);
    response.on('close', () => this.streams.delete(response));
  }

  private sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  }

  private sendError(response: ServerResponse, status: number): void {
    const code = ERROR_CODE_BY_STATUS[status] ?? 'internal';
    this.sendJson(response, status, createApiError(code, `fake error ${status}`));
  }
}
