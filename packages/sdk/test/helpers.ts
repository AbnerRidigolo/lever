import type { LeverLogger } from '../src/logger.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  fields: Record<string, unknown>;
  message: string;
}

export interface CapturingLogger extends LeverLogger {
  entries: LogEntry[];
  /** Entries of a level, optionally filtered by message. */
  at(level: LogLevel, message?: string): LogEntry[];
}

/** Logger that keeps every entry in memory, for assertions. */
export function capturingLogger(): CapturingLogger {
  const entries: LogEntry[] = [];
  const write =
    (level: LogLevel) =>
    (fields: Record<string, unknown>, message: string): void => {
      entries.push({ level, fields, message });
    };
  return {
    entries,
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    at(level, message) {
      return entries.filter(
        (entry) => entry.level === level && (message === undefined || entry.message === message),
      );
    },
  };
}

/** Polls until the assertion passes or the timeout expires. */
export async function eventually<T>(
  check: () => Promise<T> | T,
  { timeoutMs = 5_000, intervalMs = 10 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const TEST_API_KEY = 'lvr_dev_test-key_0123456789abcdefghijklmnopqrstuv';
