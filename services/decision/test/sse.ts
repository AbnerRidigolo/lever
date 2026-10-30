import { streamEventSchema, type StreamEvent } from '@lever/schemas';

export interface ReceivedEvent {
  id: string | undefined;
  event: StreamEvent;
}

export interface SseClient {
  status: number;
  headers: Headers;
  /** Resolves with the next event, or rejects after the timeout. */
  next(timeoutMs?: number): Promise<ReceivedEvent>;
  /** Resolves when the server ends the stream. */
  ended(timeoutMs?: number): Promise<void>;
  close(): void;
}

/** Minimal Server-Sent Events client for the tests, built on fetch. */
export async function openStream(url: string, headers: Record<string, string>): Promise<SseClient> {
  const abort = new AbortController();
  const response = await fetch(url, { headers, signal: abort.signal });
  if (response.body === null) throw new Error('stream without body');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const queue: ReceivedEvent[] = [];
  const waiting: ((event: ReceivedEvent) => void)[] = [];
  let buffer = '';
  let done = false;
  const doneWaiters: (() => void)[] = [];

  void (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += chunk.value;
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const received = parseBlock(block);
          const waiter = waiting.shift();
          if (waiter === undefined) queue.push(received);
          else waiter(received);
          separator = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    } finally {
      done = true;
      for (const resolve of doneWaiters) resolve();
    }
  })();

  return {
    status: response.status,
    headers: response.headers,
    next(timeoutMs = 5_000) {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('timed out waiting for an event'));
        }, timeoutMs);
        waiting.push((event) => {
          clearTimeout(timer);
          resolve(event);
        });
      });
    },
    ended(timeoutMs = 5_000) {
      if (done) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('stream did not end'));
        }, timeoutMs);
        doneWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    close() {
      abort.abort();
    },
  };
}

function parseBlock(block: string): ReceivedEvent {
  let id: string | undefined;
  let name = '';
  let data = '';
  for (const line of block.split('\n')) {
    const colon = line.indexOf(': ');
    const field = line.slice(0, colon);
    const value = line.slice(colon + 2);
    if (field === 'id') id = value;
    else if (field === 'event') name = value;
    else if (field === 'data') data += value;
  }
  const parsed: unknown = JSON.parse(data);
  return { id, event: streamEventSchema.parse({ event: name, data: parsed }) };
}
