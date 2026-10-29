import { CONFIG_CHANGES_CHANNEL, configChangeNotificationSchema } from '@lever/schemas';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { configVersions } from '../src/schema/index.js';
import { createTestProject, type TestProject, useTestDb } from './helpers.js';

const db = useTestDb();
const listener = postgres(inject('databaseUrl'), { max: 1 });

const received: unknown[] = [];
let project: TestProject;

beforeAll(async () => {
  project = await createTestProject(db);
  await listener.listen(CONFIG_CHANGES_CHANNEL, (payload) => {
    received.push(JSON.parse(payload));
  });
});

afterAll(async () => {
  await listener.end();
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a notification');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function notificationsFor(environmentId: string) {
  return received
    .map((payload) => configChangeNotificationSchema.parse(payload))
    .filter((notification) => notification.environmentId === environmentId);
}

describe('config_versions notification', () => {
  it('FR-008: publishing a version notifies the environment and the version', async () => {
    await db.insert(configVersions).values({ environmentId: project.developmentId, version: 1 });

    await waitFor(() => notificationsFor(project.developmentId).length === 1);
    expect(notificationsFor(project.developmentId)).toEqual([
      { environmentId: project.developmentId, version: 1 },
    ]);
  });

  it('FR-008: a rolled-back transaction sends no notification', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(configVersions).values({ environmentId: project.productionId, version: 1 });
        tx.rollback();
      }),
    ).rejects.toThrow();

    // A committed change afterwards proves the listener is still receiving.
    await db.insert(configVersions).values({ environmentId: project.productionId, version: 2 });
    await waitFor(() => notificationsFor(project.productionId).length > 0);
    expect(notificationsFor(project.productionId)).toEqual([
      { environmentId: project.productionId, version: 2 },
    ]);
  });
});
