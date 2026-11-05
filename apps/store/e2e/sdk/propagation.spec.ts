import { expect, test } from '@playwright/test';

import { publishVersion } from './db';
import { storeGauge } from './metrics';

// The propagation path console → Postgres → decision → SDK → store, measured without the
// author's evaluation: the store's SDK must hold the new version in under 5 s (NFR-003, AC-5.4).

test('AC-5.4, NFR-003: a published version reaches the store in under 5 s, without restart', async ({
  request,
}) => {
  await request.get('/');
  await expect
    .poll(() => storeGauge(request, 'lever_sdk_config_version'), { timeout: 10_000 })
    .not.toBeNull();

  const version = await publishVersion();
  const started = Date.now();
  await expect
    .poll(() => storeGauge(request, 'lever_sdk_config_version'), {
      timeout: 5_000,
      intervals: [100],
    })
    .toBe(version);
  expect(Date.now() - started).toBeLessThan(5_000);
});
