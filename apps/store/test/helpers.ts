import type { UserContext } from '@lever/schemas';
import { pino, type Logger } from 'pino';

export const USER: UserContext = {
  id: '3f1c8a52-6b7d-4e0f-9a21-5c4d3b2a1f00',
  attributes: { country: 'BR', device: 'mobile' },
};

/** A real pino logger whose JSON lines are kept for assertions. */
export function captureLogger(): { logger: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'debug' },
    {
      write(line: string) {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { logger, lines };
}
