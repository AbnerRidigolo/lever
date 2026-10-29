import { pino } from 'pino';

// `base` replaces pino's default `pid` and `hostname` fields.
export const logger = pino({ base: { name: 'lever-db' } });
