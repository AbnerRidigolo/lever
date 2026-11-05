import {
  configVersions,
  createDb,
  experimentEnvironments,
  flagEnvironments,
  segments,
} from '@lever/db';
import type { ExperimentStatus, SegmentRules } from '@lever/schemas';
import { and, eq, max } from 'drizzle-orm';

import { SDK_E2E_DATABASE_URL } from './env';
import { SEED } from './seed-ids';

// What the console does on a change, reduced to the rows the store tests need: update the
// configuration and publish a new version, whose trigger notifies the decision service.

const DEVELOPMENT = SEED.development;

async function withDb<T>(work: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(SDK_E2E_DATABASE_URL, { maxConnections: 1 });
  try {
    return await work(db);
  } finally {
    await close();
  }
}

/** Publishes the next configuration version of development and returns it. */
export async function publishVersion(): Promise<number> {
  return withDb(async (db) => {
    const [current] = await db
      .select({ version: max(configVersions.version) })
      .from(configVersions)
      .where(eq(configVersions.environmentId, DEVELOPMENT));
    const version = (current?.version ?? 0) + 1;
    await db.insert(configVersions).values({ environmentId: DEVELOPMENT, version });
    return version;
  });
}

/** Turns `new-banner` on or off in development, optionally limited to a segment. */
export async function setNewBanner(enabled: boolean, segmentId: string | null = null) {
  await withDb((db) =>
    db
      .update(flagEnvironments)
      .set({ enabled, segmentId })
      .where(
        and(
          eq(flagEnvironments.flagId, SEED.newBannerFlag),
          eq(flagEnvironments.environmentId, DEVELOPMENT),
        ),
      ),
  );
  return publishVersion();
}

export async function setCheckoutStatus(status: ExperimentStatus) {
  await withDb((db) =>
    db
      .update(experimentEnvironments)
      .set({ status })
      .where(
        and(
          eq(experimentEnvironments.experimentId, SEED.checkoutLayoutExperiment),
          eq(experimentEnvironments.environmentId, DEVELOPMENT),
        ),
      ),
  );
  return publishVersion();
}

export async function createSegment(key: string, rules: SegmentRules): Promise<string> {
  return withDb(async (db) => {
    const [segment] = await db
      .insert(segments)
      .values({ projectId: SEED.project, key, name: key, rules })
      .returning({ id: segments.id });
    if (segment === undefined) throw new Error('segment was not inserted');
    return segment.id;
  });
}
