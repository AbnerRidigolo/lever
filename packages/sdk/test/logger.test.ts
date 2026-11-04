import { afterEach, describe, expect, it, vi } from 'vitest';

import { consoleLogger, isLeverLogger, OncePerKey } from '../src/logger.js';
import { capturingLogger } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('default console logger (D9)', () => {
  it('writes warnings and errors as one JSON line and serializes errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    consoleLogger.warn({ attempt: 2 }, 'stream failed');
    consoleLogger.error({ err: new RangeError('boom') }, 'evaluation failed');

    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      level: 'warn',
      name: 'lever-sdk',
      msg: 'stream failed',
      attempt: 2,
    });
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      level: 'error',
      name: 'lever-sdk',
      msg: 'evaluation failed',
      err: { name: 'RangeError', message: 'boom' },
    });
  });

  it('drops debug and info', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    consoleLogger.debug({}, 'x');
    consoleLogger.info({}, 'y');
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });
});

describe('logger helpers', () => {
  it('recognizes objects with the four methods, such as a pino logger', () => {
    expect(isLeverLogger(capturingLogger())).toBe(true);
    expect(isLeverLogger(consoleLogger)).toBe(true);
    expect(isLeverLogger(null)).toBe(false);
    expect(isLeverLogger({ debug: 1, info: 1, warn: 1, error: 1 })).toBe(false);
  });

  it('reports each key once and remembers at most maxKeys keys', () => {
    const once = new OncePerKey(2);
    expect(once.first('a')).toBe(true);
    expect(once.first('a')).toBe(false);
    expect(once.first('b')).toBe(true);
    expect(once.first('c')).toBe(false);
  });
});
