import { describe, expect, it } from 'vitest';

import { SseParser, type SseMessage } from '../src/sse.js';

function parse(...chunks: string[]): SseMessage[] {
  const messages: SseMessage[] = [];
  const parser = new SseParser((message) => messages.push(message));
  for (const chunk of chunks) parser.push(chunk);
  return messages;
}

describe('SSE parser (FR-006, client side)', () => {
  it('parses the events sent by the decision service', () => {
    expect(parse('event: config\nid: 3\ndata: {"version":3}\n\nevent: ping\ndata: {}\n\n')).toEqual(
      [
        { event: 'config', data: '{"version":3}', id: '3' },
        { event: 'ping', data: '{}', id: '3' },
      ],
    );
  });

  it.each([
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
  ])('accepts %s line endings', (_name, eol) => {
    expect(parse(`event: ping${eol}data: {}${eol}${eol}`)).toEqual([
      { event: 'ping', data: '{}', id: undefined },
    ]);
  });

  it('joins several data lines with a line feed', () => {
    expect(parse('data: a\ndata: b\ndata:c\n\n')).toEqual([
      { event: 'message', data: 'a\nb\nc', id: undefined },
    ]);
  });

  it('ignores comments, unknown fields, retry and events without data', () => {
    expect(parse(': keep-alive\nretry: 10\nfoo: bar\n\nevent: x\n\nevent: y\ndata\n\n')).toEqual([
      { event: 'y', data: '', id: undefined },
    ]);
  });

  it('reassembles messages split across chunks, including a split \\r\\n', () => {
    expect(parse('﻿event: con', 'fig\r', '\ndata: {"a"', ':1}\r', '\r', '\n')).toEqual([
      { event: 'config', data: '{"a":1}', id: undefined },
    ]);
  });

  it('does not wait for more input after a lone \\r followed by text', () => {
    expect(parse('data: 1\r', 'data: 2\r\r')).toEqual([
      { event: 'message', data: '1\n2', id: undefined },
    ]);
  });

  it('keeps an incomplete message until the blank line arrives', () => {
    const messages: SseMessage[] = [];
    const parser = new SseParser((message) => messages.push(message));
    parser.push('event: ping\ndata: {}\n');
    expect(messages).toHaveLength(0);
    parser.push('');
    parser.push('\n');
    expect(messages).toHaveLength(1);
  });

  it('ignores ids with a NUL character', () => {
    expect(parse('id: a\0b\ndata: x\n\n')[0]?.id).toBeUndefined();
  });
});
