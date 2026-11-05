import {
  streamEventSchema,
  type EnvironmentConfig,
  type ExperimentConfig,
  type FlagConfig,
  type SegmentConfig,
} from '@lever/schemas';

import type { SseMessage } from './sse.js';

/** A validated configuration with the indexes used by every evaluation. */
export interface LoadedConfig {
  readonly config: EnvironmentConfig;
  readonly version: number;
  readonly flags: ReadonlyMap<string, FlagConfig>;
  readonly experiments: ReadonlyMap<string, ExperimentConfig>;
  readonly segments: ReadonlyMap<string, SegmentConfig>;
}

export type StreamMessage =
  | { kind: 'config'; config: EnvironmentConfig }
  | { kind: 'ping' }
  | { kind: 'ignored'; event: string }
  | { kind: 'invalid'; event: string; reason: string };

const KNOWN_EVENTS = new Set(['config', 'ping']);

/**
 * Validates one stream message with `streamEventSchema` (sdk plan, D8). Unknown event names are
 * ignored, so the server can add events later. The reason never contains the payload.
 */
export function parseStreamMessage(message: SseMessage): StreamMessage {
  if (!KNOWN_EVENTS.has(message.event)) return { kind: 'ignored', event: message.event };

  let data: unknown;
  try {
    data = JSON.parse(message.data);
  } catch {
    return { kind: 'invalid', event: message.event, reason: 'data is not valid JSON' };
  }

  const result = streamEventSchema.safeParse({ event: message.event, data });
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.map(String).join('.') || '(root)');
    return {
      kind: 'invalid',
      event: message.event,
      reason: `schema validation failed at ${[...new Set(paths)].slice(0, 5).join(', ')}`,
    };
  }
  return result.data.event === 'config'
    ? { kind: 'config', config: result.data.data }
    : { kind: 'ping' };
}

function indexByKey<T extends { key: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.key, item]));
}

export function loadConfig(config: EnvironmentConfig): LoadedConfig {
  return {
    config,
    version: config.version,
    flags: indexByKey(config.flags),
    experiments: indexByKey(config.experiments),
    segments: indexByKey(config.segments),
  };
}

export type ApplyResult = 'applied' | 'same' | 'older';

/**
 * The last valid configuration (AC-5.6). It is only replaced by a newer version, in one
 * assignment, so an evaluation sees either the old or the new configuration, never a mix (D4).
 */
export class ConfigCache {
  private loaded: LoadedConfig | null = null;
  private confirmedAt: number | null = null;

  constructor(private readonly now: () => number) {}

  get current(): LoadedConfig | null {
    return this.loaded;
  }

  /** Applies an already validated configuration if it is newer than the current one. */
  apply(config: EnvironmentConfig): ApplyResult {
    const current = this.loaded;
    if (current !== null && config.version <= current.version) {
      this.markFresh();
      return config.version === current.version ? 'same' : 'older';
    }
    this.loaded = loadConfig(config);
    this.markFresh();
    return 'applied';
  }

  /** The server confirmed that the configuration is current (a `config` or a `ping`). */
  markFresh(): void {
    this.confirmedAt = this.now();
  }

  /**
   * Time since the server last confirmed the configuration (sdk plan, D11);
   * null without configuration.
   */
  ageMs(): number | null {
    if (this.loaded === null || this.confirmedAt === null) return null;
    return Math.max(0, this.now() - this.confirmedAt);
  }
}
