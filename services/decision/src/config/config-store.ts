import type { EnvironmentConfig } from '@lever/schemas';
import type { FastifyBaseLogger } from 'fastify';

import { HttpError } from '../errors.js';

export type ConfigLoader = (environmentId: string) => Promise<EnvironmentConfig | null>;

export interface ConfigUpdate {
  environmentId: string;
  config: EnvironmentConfig;
}

export type ConfigListener = (update: ConfigUpdate) => void;

export interface CachedConfigInfo {
  version: number;
  /** When this version was loaded, in milliseconds since the epoch. */
  loadedAt: number;
}

export interface ConfigStoreOptions {
  load: ConfigLoader;
  logger: FastifyBaseLogger;
  now?: () => number;
}

interface CacheEntry {
  config: EnvironmentConfig;
  loadedAt: number;
}

/**
 * In-memory configuration per environment. Loaded on first use, refreshed on change
 * notifications, and never replaced by an older version or by a failed load: if Postgres is
 * down the last valid configuration keeps being served (NFR-004).
 */
export class ConfigStore {
  private readonly load: ConfigLoader;
  private readonly logger: FastifyBaseLogger;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<EnvironmentConfig>>();
  private readonly listeners = new Set<ConfigListener>();

  constructor(options: ConfigStoreOptions) {
    this.load = options.load;
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
  }

  /** The current configuration of an environment, loading it on first use. */
  async get(environmentId: string): Promise<EnvironmentConfig> {
    const cached = this.cache.get(environmentId);
    if (cached !== undefined) return cached.config;

    let pending = this.pending.get(environmentId);
    if (pending === undefined) {
      pending = this.loadFirst(environmentId).finally(() => this.pending.delete(environmentId));
      this.pending.set(environmentId, pending);
    }
    return pending;
  }

  /**
   * Reloads a cached environment. With `version`, skips the reload when the cache already
   * has that version or a newer one. Environments that were never served are ignored.
   */
  async refresh(environmentId: string, version?: number): Promise<void> {
    const cached = this.cache.get(environmentId);
    if (cached === undefined) return;
    if (version !== undefined && version <= cached.config.version) return;

    try {
      const config = await this.load(environmentId);
      if (config !== null) this.store(environmentId, config);
    } catch (error) {
      this.logger.error(
        { err: error, environmentId, servedVersion: cached.config.version },
        'config refresh failed, keeping the last valid configuration',
      );
    }
  }

  /** Reloads every cached environment, e.g. after reconnecting to Postgres. */
  async refreshAll(): Promise<void> {
    await Promise.all([...this.cache.keys()].map((environmentId) => this.refresh(environmentId)));
  }

  subscribe(listener: ConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Version and load time of every cached environment (for metrics). */
  info(): ReadonlyMap<string, CachedConfigInfo> {
    return new Map(
      [...this.cache].map(([environmentId, entry]) => [
        environmentId,
        { version: entry.config.version, loadedAt: entry.loadedAt },
      ]),
    );
  }

  private async loadFirst(environmentId: string): Promise<EnvironmentConfig> {
    let config: EnvironmentConfig | null;
    try {
      config = await this.load(environmentId);
    } catch (error) {
      this.logger.error({ err: error, environmentId }, 'config load failed');
      throw new HttpError('service_unavailable', 'Configuration is temporarily unavailable');
    }
    if (config === null) {
      throw new HttpError(
        'service_unavailable',
        'No configuration has been published for this environment',
      );
    }
    this.store(environmentId, config);
    return this.cache.get(environmentId)?.config ?? config;
  }

  private store(environmentId: string, config: EnvironmentConfig): void {
    const cached = this.cache.get(environmentId);
    if (cached !== undefined && config.version <= cached.config.version) return;

    this.cache.set(environmentId, { config, loadedAt: this.now() });
    this.logger.info({ environmentId, version: config.version }, 'config loaded');
    for (const listener of this.listeners) {
      try {
        listener({ environmentId, config });
      } catch (error) {
        this.logger.error({ err: error, environmentId }, 'config listener failed');
      }
    }
  }
}
