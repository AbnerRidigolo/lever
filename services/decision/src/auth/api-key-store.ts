import { apiKeys, environments, type Database } from '@lever/db';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import { HttpError } from '../errors.js';

/** The environment an API key gives access to. */
export interface AuthenticatedKey {
  apiKeyId: string;
  environmentId: string;
  projectId: string;
}

/** Where API keys are read from and their usage recorded. */
export interface ApiKeySource {
  /** The active (not revoked) key with this hash, or null. */
  find(keyHash: string): Promise<AuthenticatedKey | null>;
  touch(apiKeyId: string, usedAt: Date): Promise<void>;
}

export function createDbApiKeySource(db: Database): ApiKeySource {
  return {
    async find(keyHash) {
      const [row] = await db
        .select({
          apiKeyId: apiKeys.id,
          environmentId: apiKeys.environmentId,
          projectId: environments.projectId,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);
      if (row?.revokedAt !== null) return null;
      return {
        apiKeyId: row.apiKeyId,
        environmentId: row.environmentId,
        projectId: row.projectId,
      };
    },
    async touch(apiKeyId, usedAt) {
      await db.update(apiKeys).set({ lastUsedAt: usedAt }).where(eq(apiKeys.id, apiKeyId));
    },
  };
}

export interface ApiKeyStoreOptions {
  source: ApiKeySource;
  logger: FastifyBaseLogger;
  /** How long a validated key is trusted before it is checked again (decision plan, D5). */
  ttlMs: number;
  /** Minimum interval between two `last_used_at` updates of the same key. */
  touchIntervalMs?: number;
  now?: () => number;
}

interface CacheEntry {
  key: AuthenticatedKey;
  expiresAt: number;
}

/**
 * Resolves API key hashes to environments, with a cache that keeps serving known keys
 * while Postgres is down (NFR-004). Unknown keys are never cached.
 */
export class ApiKeyStore {
  private readonly source: ApiKeySource;
  private readonly logger: FastifyBaseLogger;
  private readonly ttlMs: number;
  private readonly touchIntervalMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastTouchedAt = new Map<string, number>();

  constructor(options: ApiKeyStoreOptions) {
    this.source = options.source;
    this.logger = options.logger;
    this.ttlMs = options.ttlMs;
    this.touchIntervalMs = options.touchIntervalMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  async resolve(keyHash: string): Promise<AuthenticatedKey | null> {
    const cached = this.cache.get(keyHash);
    if (cached !== undefined && cached.expiresAt > this.now()) {
      this.touch(cached.key);
      return cached.key;
    }

    let key: AuthenticatedKey | null;
    try {
      key = await this.source.find(keyHash);
    } catch (error) {
      if (cached !== undefined) {
        this.logger.warn({ err: error }, 'API key lookup failed, using the cached key');
        return cached.key;
      }
      this.logger.error({ err: error }, 'API key lookup failed');
      throw new HttpError('service_unavailable', 'Unable to validate the API key');
    }

    if (key === null) {
      this.cache.delete(keyHash);
      return null;
    }
    this.cache.set(keyHash, { key, expiresAt: this.now() + this.ttlMs });
    this.touch(key);
    return key;
  }

  /** Updates `last_used_at` at most once per interval, without delaying the request. */
  private touch(key: AuthenticatedKey): void {
    const now = this.now();
    const last = this.lastTouchedAt.get(key.apiKeyId);
    if (last !== undefined && now - last < this.touchIntervalMs) return;
    this.lastTouchedAt.set(key.apiKeyId, now);

    this.source.touch(key.apiKeyId, new Date(now)).catch((error: unknown) => {
      this.logger.warn({ err: error, apiKeyId: key.apiKeyId }, 'failed to update last_used_at');
    });
  }
}
