import {
  userContextSchema,
  type ExperimentConfig,
  type ExposureEvent,
  type FlagConfig,
  type FlagType,
  type FlagValue,
  type FlagValueByType,
  type SegmentConfig,
  type UserContext,
} from '@lever/schemas';

import { Backoff } from './backoff.js';
import { ConfigCache, parseStreamMessage } from './config-cache.js';
import { StreamConnection } from './connection.js';
import { defaultEvaluator, type Evaluator } from './evaluator.js';
import { ExposureHub, type ExposureListener } from './exposure.js';
import { consoleLogger, OncePerKey, type LeverLogger } from './logger.js';
import { ClientCounters, type LeverClientMetrics } from './metrics.js';
import {
  DEFAULT_READY_TIMEOUT_MS,
  resolveOptions,
  type LeverClientOptions,
  type ResolvedOptions,
} from './options.js';
import type { SseMessage } from './sse.js';

/** `unauthorized`: the API key was rejected (401, 403 or 404), so waiting longer cannot help. */
export type ReadyResult = 'ready' | 'timeout' | 'closed' | 'unauthorized';

export interface LeverClient {
  /**
   * Resolves when the first valid configuration arrives, on timeout, or as soon as the API key is
   * rejected. Never rejects (D2).
   */
  ready(options?: { timeoutMs?: number }): Promise<ReadyResult>;
  /** Value of a flag for the user, or the default (AC-5.1, D7). Never throws. */
  getFlag(key: string, user: UserContext, defaultValue: boolean): boolean;
  getFlag(key: string, user: UserContext, defaultValue: string): string;
  getFlag(key: string, user: UserContext, defaultValue: number): number;
  getFlag<T extends FlagValueByType['json']>(key: string, user: UserContext, defaultValue: T): T;
  /** Variant key of the user (AC-5.2); null without config or for an unknown experiment (D6). */
  getVariant(key: string, user: UserContext): string | null;
  /**
   * Adds a listener called on every variant assignment (AC-5.7): a running experiment and a user
   * inside its segment (D10). Returns the function that removes the listener.
   */
  onExposure(listener: (event: ExposureEvent) => void): () => void;
  /** Counters and config age for the app to expose (spec 001 section 10, D11). */
  getMetrics(): LeverClientMetrics;
  /** Stops the stream and timers. Evaluations keep using the last configuration. */
  close(): Promise<void>;
}

/** Injected by the tests only; the public client always uses the defaults (sdk plan, D13). */
export interface ClientDeps {
  evaluator: Evaluator;
  now: () => number;
  random: () => number;
}

export const defaultDeps: ClientDeps = {
  evaluator: defaultEvaluator,
  now: Date.now,
  random: Math.random,
};

function matchesFlagType(type: FlagType, value: FlagValue): boolean {
  switch (type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'json':
      return typeof value === 'object' && value !== null;
  }
}

class Client implements LeverClient {
  private readonly logger: LeverLogger;
  private readonly cache: ConfigCache;
  private readonly connection: StreamConnection;
  private readonly exposures: ExposureHub;
  private readonly counters = new ClientCounters();
  private readonly warned = new OncePerKey();
  private readonly readyWaiters = new Set<(result: ReadyResult) => void>();
  private closed = false;

  constructor(
    options: ResolvedOptions,
    private readonly deps: ClientDeps,
  ) {
    this.logger = options.logger ?? consoleLogger;
    this.cache = new ConfigCache(deps.now);
    this.exposures = new ExposureHub(this.logger);
    this.connection = new StreamConnection({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs,
      backoff: new Backoff(options.backoff, deps.random),
      logger: this.logger,
      onMessage: (message) => this.handleMessage(message),
      onStateChange: (state) => {
        if (state !== 'unauthorized') return;
        for (const finish of [...this.readyWaiters]) finish('unauthorized');
      },
    });
    this.connection.start();
  }

  ready({
    timeoutMs = DEFAULT_READY_TIMEOUT_MS,
  }: { timeoutMs?: number } = {}): Promise<ReadyResult> {
    if (this.closed) return Promise.resolve('closed');
    if (this.cache.current !== null) return Promise.resolve('ready');
    if (this.connection.state === 'unauthorized') return Promise.resolve('unauthorized');
    return new Promise((resolve) => {
      const finish = (result: ReadyResult): void => {
        clearTimeout(timer);
        this.readyWaiters.delete(finish);
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish('timeout');
      }, timeoutMs);
      this.readyWaiters.add(finish);
    });
  }

  getFlag(key: string, user: UserContext, defaultValue: boolean): boolean;
  getFlag(key: string, user: UserContext, defaultValue: string): string;
  getFlag(key: string, user: UserContext, defaultValue: number): number;
  getFlag<T extends FlagValueByType['json']>(key: string, user: UserContext, defaultValue: T): T;
  getFlag(key: string, user: UserContext, defaultValue: FlagValue): FlagValue {
    this.counters.flagEvaluations += 1;
    if (!this.isValidUser(user)) return defaultValue;
    const loaded = this.cache.current;
    if (loaded === null) return defaultValue;

    const flag = loaded.flags.get(key);
    if (flag === undefined) {
      this.warnOnce(`flag:${key}`, { flagKey: key }, 'unknown flag; serving the default value');
      return defaultValue;
    }
    if (!matchesFlagType(flag.type, defaultValue)) {
      this.warnOnce(
        `flag-type:${key}`,
        { flagKey: key, flagType: flag.type },
        'default value does not match the flag type; serving the default value',
      );
      return defaultValue;
    }

    return this.evaluateFlag(flag, user, loaded.segments, defaultValue);
  }

  getVariant(key: string, user: UserContext): string | null {
    this.counters.experimentEvaluations += 1;
    if (!this.isValidUser(user)) return null;
    const loaded = this.cache.current;
    if (loaded === null) return null;

    const experiment = loaded.experiments.get(key);
    if (experiment === undefined) {
      this.warnOnce(`experiment:${key}`, { experimentKey: key }, 'unknown experiment');
      return null;
    }

    let variantKey: string;
    try {
      variantKey = this.deps.evaluator.evaluateExperiment(experiment, user, loaded.segments);
    } catch (error) {
      this.reportEvaluationError(`experiment-error:${key}`, { experimentKey: key }, error);
      return null;
    }
    if (this.isAssigned(experiment, user, loaded.segments)) {
      this.exposures.emit({
        type: 'exposure',
        experimentKey: experiment.key,
        variantKey,
        userId: user.id,
        configVersion: loaded.version,
        timestamp: new Date(this.deps.now()).toISOString(),
      });
    }
    return variantKey;
  }

  onExposure(listener: ExposureListener): () => void {
    return this.exposures.add(listener);
  }

  getMetrics(): LeverClientMetrics {
    return {
      flagEvaluations: this.counters.flagEvaluations,
      experimentEvaluations: this.counters.experimentEvaluations,
      evaluationErrors: this.counters.evaluationErrors,
      invalidMessages: this.counters.invalidMessages,
      reconnects: this.connection.reconnects,
      configVersion: this.cache.current?.version ?? null,
      configAgeMs: this.cache.ageMs(),
      connection: this.connection.state,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const finish of [...this.readyWaiters]) finish('closed');
    await this.connection.close();
  }

  private evaluateFlag(
    flag: FlagConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
    defaultValue: FlagValue,
  ): FlagValue {
    let value: FlagValue;
    try {
      value = this.deps.evaluator.evaluateFlag(flag, user, segments);
    } catch (error) {
      this.reportEvaluationError(`flag-error:${flag.key}`, { flagKey: flag.key }, error);
      return defaultValue;
    }
    if (!matchesFlagType(flag.type, value)) {
      this.reportEvaluationError(
        `flag-error:${flag.key}`,
        { flagKey: flag.key },
        new TypeError(`evaluator returned a value that is not of type ${flag.type}`),
      );
      return defaultValue;
    }
    return value;
  }

  /**
   * Whether the user takes part in the experiment, so the assignment is an exposure (D10): the
   * experiment is running and the user is inside its segment, as decided by the author's
   * `matchesSegment`. Other users get the control variant but are not exposed.
   */
  private isAssigned(
    experiment: ExperimentConfig,
    user: UserContext,
    segments: ReadonlyMap<string, SegmentConfig>,
  ): boolean {
    if (experiment.status !== 'running') return false;
    if (experiment.segmentKey === null) return true;
    const segment = segments.get(experiment.segmentKey);
    // The config schema guarantees the segment exists; this only guards the type.
    if (segment === undefined) return false;
    try {
      return this.deps.evaluator.matchesSegment(segment, user);
    } catch (error) {
      this.reportEvaluationError(
        `segment-error:${experiment.key}`,
        { experimentKey: experiment.key, segmentKey: segment.key },
        error,
      );
      return false;
    }
  }

  private handleMessage(message: SseMessage): boolean {
    const parsed = parseStreamMessage(message);
    switch (parsed.kind) {
      case 'ignored':
        this.logger.debug({ event: parsed.event }, 'unknown stream event ignored');
        return false;
      case 'invalid':
        this.counters.invalidMessages += 1;
        this.logger.error(
          { event: parsed.event, reason: parsed.reason },
          'invalid stream message discarded; keeping the last valid configuration',
        );
        return false;
      case 'ping':
        this.cache.markFresh();
        return false;
      case 'config': {
        const result = this.cache.apply(parsed.config);
        if (result === 'applied') {
          this.logger.info({ version: parsed.config.version }, 'configuration applied');
          for (const finish of [...this.readyWaiters]) finish('ready');
        } else if (result === 'older') {
          this.logger.warn(
            { version: parsed.config.version, currentVersion: this.cache.current?.version },
            'older configuration ignored',
          );
        }
        return true;
      }
    }
  }

  private isValidUser(user: UserContext): boolean {
    if (userContextSchema.safeParse(user).success) return true;
    this.warnOnce('invalid-user', {}, 'invalid user context; serving the default value');
    return false;
  }

  private reportEvaluationError(
    onceKey: string,
    fields: Record<string, unknown>,
    error: unknown,
  ): void {
    this.counters.evaluationErrors += 1;
    if (this.warned.first(onceKey)) {
      this.logger.error({ ...fields, err: error }, 'evaluation failed; serving the default value');
    }
  }

  private warnOnce(onceKey: string, fields: Record<string, unknown>, message: string): void {
    if (this.warned.first(onceKey)) this.logger.warn(fields, message);
  }
}

/**
 * Internal factory with injectable dependencies. Not exported by the package: the tests use it to
 * run without the author's evaluation (sdk plan, D13).
 */
export function createClient(options: LeverClientOptions, deps: ClientDeps): LeverClient {
  return new Client(resolveOptions(options), deps);
}

/**
 * Creates a Lever client (spec 001, US-5). It connects right away and never blocks: before the
 * first configuration arrives, flags return their defaults and variants return null (AC-5.5).
 * Evaluation always uses @lever/evaluation, the same code as the decision service (AC-5.8).
 */
export function createLeverClient(options: LeverClientOptions): LeverClient {
  return createClient(options, defaultDeps);
}
