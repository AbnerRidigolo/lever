import { pino } from 'pino';

// Logs never carry user ids, account ids, attributes, names, addresses or the API key
// (store plan, section 4).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'lever-store' },
});
