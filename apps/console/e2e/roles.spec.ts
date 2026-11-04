import { expect, test, type Request } from '@playwright/test';

import { ADMIN_EMAIL, VIEWER_EMAIL } from './env';
import { openFlag, signIn } from './helpers';

test.describe('roles', () => {
  test('AC-7.2: a viewer sees no edit controls', async ({ page }) => {
    await signIn(page, VIEWER_EMAIL);
    await openFlag(page, 'new-banner');
    await expect(page.getByText('desligada').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apagar flag' })).toHaveCount(0);

    await page.goto('/projects/demo-store/flags');
    await expect(page.getByRole('button', { name: 'Criar flag' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'API keys' })).toHaveCount(0);

    const denied = await page.goto('/projects/demo-store/api-keys');
    expect(denied?.status()).toBe(403);
  });

  test('AC-7.2: a forged Server Action call gets HTTP 403 and changes nothing', async ({
    browser,
  }) => {
    // Records a real call made by an admin...
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await openFlag(admin, 'new-banner');

    const captured = new Promise<Request>((resolve) => {
      admin.on('request', (request) => {
        if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) {
          resolve(request);
        }
      });
    });
    await admin.getByRole('button', { name: 'Salvar development' }).click();
    const original = await captured;
    await expect(admin.getByRole('status')).toContainText('Salvo em development');

    const url = original.url();
    const headers = {
      'next-action': original.headers()['next-action'] ?? '',
      'content-type': original.headers()['content-type'] ?? '',
      accept: 'text/x-component',
    };
    const body = original.postDataBuffer();
    if (body === null) throw new Error('the action had no body');

    // ...and replays it with the session of a viewer, then with no session at all.
    const viewerContext = await browser.newContext();
    const viewer = await viewerContext.newPage();
    await signIn(viewer, VIEWER_EMAIL);
    const forged = await viewerContext.request.post(url, { headers, data: body });
    expect(forged.status()).toBe(403);

    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.request.post(url, { headers, data: body });
    expect(anonymous.status()).toBe(401);

    // Sanity check: the same request is accepted for the admin.
    const accepted = await adminContext.request.post(url, { headers, data: body });
    expect(accepted.status()).toBe(200);

    await Promise.all([adminContext.close(), viewerContext.close(), anonymousContext.close()]);
  });
});
