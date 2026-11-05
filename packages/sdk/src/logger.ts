/**
 * Logger used by the SDK (sdk plan, D9). Same call shape as pino, so a pino logger can be passed
 * as is. The SDK never logs the API key, the user id or the user attributes.
 */
export interface LeverLogger {
  debug(fields: Record<string, unknown>, message: string): void;
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

const LOGGER_METHODS = ['debug', 'info', 'warn', 'error'] as const;

export function isLeverLogger(value: unknown): value is LeverLogger {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return LOGGER_METHODS.every((method) => typeof candidate[method] === 'function');
}

function serializeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    serialized[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
  }
  return serialized;
}

function writeLine(
  write: (line: string) => void,
  level: string,
  fields: Record<string, unknown>,
  message: string,
): void {
  write(JSON.stringify({ level, name: 'lever-sdk', msg: message, ...serializeFields(fields) }));
}

/**
 * Default logger: warnings and errors go to the console as one JSON line, so they never get lost;
 * debug and info are dropped.
 */
export const consoleLogger: LeverLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (fields, message) => {
    writeLine(
      (line) => {
        console.warn(line);
      },
      'warn',
      fields,
      message,
    );
  },
  error: (fields, message) => {
    writeLine(
      (line) => {
        console.error(line);
      },
      'error',
      fields,
      message,
    );
  },
};

/** Remembers which keys were already reported, so repeated warnings are logged once per key. */
export class OncePerKey {
  private readonly seen = new Set<string>();

  constructor(private readonly maxKeys = 1_000) {}

  /** True the first time a key is seen (while fewer than `maxKeys` keys are remembered). */
  first(key: string): boolean {
    if (this.seen.has(key) || this.seen.size >= this.maxKeys) return false;
    this.seen.add(key);
    return true;
  }
}
