/** One Server-Sent Events message, before its data is parsed. */
export interface SseMessage {
  event: string;
  data: string;
  id: string | undefined;
}

/**
 * Incremental Server-Sent Events parser, following the WHATWG event stream format for what the
 * decision service sends: `\n`, `\r\n` or `\r` line endings, `event`, `data` (several lines joined
 * with `\n`) and `id` fields, comments and messages split across chunks. `retry` is ignored: the
 * SDK has its own backoff (sdk plan, D3).
 */
export class SseParser {
  private buffer = '';
  private skipLeadingLineFeed = false;
  private started = false;
  private eventName = '';
  private dataLines: string[] = [];
  private lastEventId: string | undefined;

  constructor(private readonly onMessage: (message: SseMessage) => void) {}

  push(chunk: string): void {
    let text = chunk;
    if (!this.started && text.length > 0) {
      this.started = true;
      if (text.startsWith('﻿')) text = text.slice(1);
    }
    if (this.skipLeadingLineFeed && text.length > 0) {
      this.skipLeadingLineFeed = false;
      if (text.startsWith('\n')) text = text.slice(1);
    }
    this.buffer += text;

    for (;;) {
      const end = this.lineEnd();
      if (end === -1) return;
      const line = this.buffer.slice(0, end);
      if (this.buffer[end] === '\r') {
        if (end + 1 === this.buffer.length) {
          // A `\r` at the end of the chunk may be the first half of `\r\n`.
          this.skipLeadingLineFeed = true;
          this.buffer = '';
        } else {
          this.buffer = this.buffer.slice(this.buffer[end + 1] === '\n' ? end + 2 : end + 1);
        }
      } else {
        this.buffer = this.buffer.slice(end + 1);
      }
      this.processLine(line);
    }
  }

  private lineEnd(): number {
    const lineFeed = this.buffer.indexOf('\n');
    const carriageReturn = this.buffer.indexOf('\r');
    if (lineFeed === -1) return carriageReturn;
    if (carriageReturn === -1) return lineFeed;
    return Math.min(lineFeed, carriageReturn);
  }

  private processLine(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.dataLines.push(value);
    else if (field === 'id' && !value.includes('\0')) this.lastEventId = value;
  }

  private dispatch(): void {
    const eventName = this.eventName;
    const dataLines = this.dataLines;
    this.eventName = '';
    this.dataLines = [];
    if (dataLines.length === 0) return;
    this.onMessage({
      event: eventName === '' ? 'message' : eventName,
      data: dataLines.join('\n'),
      id: this.lastEventId,
    });
  }
}
