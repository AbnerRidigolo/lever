import { expect, test } from '@playwright/test';

import { ADMIN_EMAIL, DECISION_URL } from './env';
import { createApiKeyInUi, signIn } from './helpers';

test('AC-7.3: the key appears once, works on the decision service and stops when revoked', async ({
  page,
  request,
}) => {
  await signIn(page, ADMIN_EMAIL);
  const key = await createApiKeyInUi(page, 'e2e-revoke', 'development');
  expect(key).toMatch(/^lvr_dev_/);

  const status = async () =>
    (
      await request.get(`${DECISION_URL}/v1/config`, {
        headers: { authorization: `Bearer ${key}` },
      })
    ).status();
  expect(await status()).toBe(200);

  // Shown only once: after a reload there is just the prefix.
  await page.reload();
  await expect(page.getByTestId('new-api-key')).toHaveCount(0);
  await expect(page.getByText(key)).toHaveCount(0);
  await expect(page.getByText(`${key.slice(0, 12)}…`)).toBeVisible();

  await page.getByRole('button', { name: 'Revogar e2e-revoke' }).click();
  await expect(page.getByText('revogada')).toBeVisible();
  await expect.poll(status, { timeout: 10_000 }).toBe(401);
});
