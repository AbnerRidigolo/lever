import { exposureEventSchema, type ExposureEvent } from '@lever/schemas';
import type { Logger } from 'pino';

/**
 * Exposure hook of this phase (AC-5.7, store plan D9): a structured log line. The user id is
 * left out, because logs carry no personal data (AGENTS.md). Spec 002 sends it to the collector.
 */
export function logExposure(logger: Logger, event: ExposureEvent): void {
  const parsed = exposureEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.warn({ experimentKey: event.experimentKey }, 'invalid exposure event dropped');
    return;
  }
  const { experimentKey, variantKey, configVersion, timestamp } = parsed.data;
  logger.info({ experimentKey, variantKey, configVersion, timestamp }, 'exposure');
}
