import { pino, type DestinationStream, type Logger } from 'pino';

/** Structured logs without personal data: the API key header is always redacted. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: { service: 'lever-decision' },
    redact: { paths: ['req.headers.authorization', 'headers.authorization'], censor: '[redacted]' },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
