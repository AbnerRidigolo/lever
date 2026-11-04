import { expect, test } from '@playwright/test';

import { ADMIN_EMAIL, MAILPIT_URL } from './env';
import { signIn } from './helpers';

test.describe('login', () => {
  test('AC-7.1: signs in with a magic link and signs out', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await expect(page.getByRole('link', { name: 'Lever Demo Store' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('AC-7.1, D5: an email that is not registered gets no link', async ({ page, request }) => {
    const email = 'stranger@example.test';
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar link de acesso' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'não tem acesso' })).toBeVisible();
    const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
      params: { query: `to:${email}` },
    });
    expect(((await response.json()) as { messages: unknown[] }).messages).toEqual([]);
  });

  test('AC-7.1: the GitHub button stays hidden without an OAuth App', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Entrar com GitHub' })).toHaveCount(0);
  });
});
