import { pino } from 'pino';

// Logs carry only ids: never emails, API keys or segment rules (console plan, section 4).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'lever-console' },
});
