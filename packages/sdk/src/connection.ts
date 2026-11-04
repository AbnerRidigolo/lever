import { apiErrorSchema } from '@lever/schemas';

import type { Backoff } from './backoff.js';
import type { LeverLogger } from './logger.js';
import { SseParser, type SseMessage } from './sse.js';

export type ConnectionState =
  'connecting' | 'connected' | 'disconnected' | 'unauthorized' | 'closed';

/** Statuses that do not get better by retrying: the key is invalid or revoked (sdk plan, D3). */
const STOP_STATUSES = new Set([401, 403, 404]);

export interface StreamConnectionOptions {
  baseUrl: string;
  apiKey: string;
  heartbeatTimeoutMs: number;
  backoff: Backoff;
  logger: LeverLogger;
  /** Handles one message; returns true when it delivered a valid configuration. */
  onMessage: (message: SseMessage) => boolean;
  onStateChange?: (state: ConnectionState) => void;
}

type Outcome =
  { kind: 'retry'; reason: string; status?: number } | { kind: 'stop'; status: number };

class HeartbeatTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`no data from the decision service for ${timeoutMs} ms`);
    this.name = 'HeartbeatTimeout';
  }
}

/**
 * Keeps `GET /v1/stream` open (FR-006): reconnects with backoff after any failure (AC-5.5),
 * treats silence longer than the heartbeat timeout as a dead stream (D4) and stops on 401, 403
 * and 404 (D3). The API key is only sent in the header and never logged.
 */
export class StreamConnection {
  private currentState: ConnectionState = 'disconnected';
  private reconnectCount = 0;
  private closed = false;
  private loop: Promise<void> | undefined;
  private abortController: AbortController | undefined;
  private wake: (() => void) | undefined;
  private readonly url: string;

  constructor(private readonly options: StreamConnectionOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/v1/stream`;
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get reconnects(): number {
    return this.reconnectCount;
  }

  start(): void {
    this.loop ??= this.run();
  }

  /** Aborts the stream and any pending wait. Idempotent. */
  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.abortController?.abort();
      this.wake?.();
    }
    await this.loop;
    this.setState('closed');
  }

  private isClosed(): boolean {
    return this.closed;
  }

  private setState(state: ConnectionState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onStateChange?.(state);
  }

  private async run(): Promise<void> {
    const { backoff, logger } = this.options;
    while (!this.isClosed()) {
      const outcome = await this.connectOnce();
      // close() may have run while connecting.
      if (this.isClosed()) break;

      if (outcome.kind === 'stop') {
        this.setState('unauthorized');
        logger.error(
          { status: outcome.status },
          'decision service rejected the api key; the sdk will not reconnect',
        );
        return;
      }

      this.setState('disconnected');
      const delayMs = backoff.next();
      this.reconnectCount += 1;
      logger.warn(
        {
          reason: outcome.reason,
          ...(outcome.status === undefined ? {} : { status: outcome.status }),
          attempt: backoff.attempts,
          delayMs,
        },
        'decision stream unavailable; reconnecting',
      );
      await this.sleep(delayMs);
    }
  }

  private async connectOnce(): Promise<Outcome> {
    const controller = new AbortController();
    this.abortController = controller;
    const heartbeat = new Heartbeat(this.options.heartbeatTimeoutMs, controller);
    this.setState('connecting');

    try {
      heartbeat.arm();
      const response = await fetch(this.url, {
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      heartbeat.arm();

      if (response.status !== 200) {
        const code = await errorCodeOf(response);
        if (STOP_STATUSES.has(response.status)) return { kind: 'stop', status: response.status };
        return { kind: 'retry', reason: `http ${response.status}${code}`, status: response.status };
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('text/event-stream') || response.body === null) {
        await response.body?.cancel();
        return { kind: 'retry', reason: 'response is not an event stream' };
      }

      this.setState('connected');
      await this.read(response.body, heartbeat);
      return { kind: 'retry', reason: 'stream ended' };
    } catch (error) {
      if (controller.signal.reason instanceof HeartbeatTimeout) {
        return { kind: 'retry', reason: controller.signal.reason.message };
      }
      return { kind: 'retry', reason: describeError(error) };
    } finally {
      heartbeat.stop();
    }
  }

  private async read(body: ReadableStream<Uint8Array>, heartbeat: Heartbeat): Promise<void> {
    const parser = new SseParser((message) => {
      if (this.options.onMessage(message)) this.options.backoff.reset();
    });
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        heartbeat.arm();
        parser.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      // A pending reconnection must not keep the app process alive.
      timer.unref();
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }
}

/** Aborts the request when no data arrives within the timeout. */
class Heartbeat {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly timeoutMs: number,
    private readonly controller: AbortController,
  ) {}

  arm(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.controller.abort(new HeartbeatTimeout(this.timeoutMs));
    }, this.timeoutMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/** ` (code)` from a standard error body, for the log; empty when the body is not one. */
async function errorCodeOf(response: Response): Promise<string> {
  try {
    const parsed = apiErrorSchema.safeParse(JSON.parse(await response.text()));
    return parsed.success ? ` (${parsed.data.error.code})` : '';
  } catch {
    return '';
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}
