import type { ExposureEvent } from '@lever/schemas';

import type { LeverLogger } from './logger.js';

export type ExposureListener = (event: ExposureEvent) => void;

/**
 * Listeners of `onExposure` (AC-5.7, sdk plan D10). Listeners run synchronously, each in its own
 * try/catch: a failing listener never changes the variant nor stops the other listeners.
 */
export class ExposureHub {
  private readonly listeners = new Set<ExposureListener>();

  constructor(private readonly logger: LeverLogger) {}

  add(listener: ExposureListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ExposureEvent): void {
    if (this.listeners.size === 0) {
      // Without listeners the exposure is only logged, without the user id (AGENTS.md: no
      // personal data in logs). The full log of AC-5.7 belongs to the app's listener.
      this.logger.debug(
        {
          experimentKey: event.experimentKey,
          variantKey: event.variantKey,
          configVersion: event.configVersion,
        },
        'exposure',
      );
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error(
          { err: error, experimentKey: event.experimentKey },
          'exposure listener failed',
        );
      }
    }
  }
}
