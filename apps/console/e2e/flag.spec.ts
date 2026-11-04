import { environmentConfigSchema } from '@lever/schemas';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { ADMIN_EMAIL, DECISION_URL, EDITOR_EMAIL } from './env';
import { createApiKeyInUi, openFlag, signIn } from './helpers';

async function bannerEnabled(
  request: APIRequestContext,
  key: string,
): Promise<boolean | undefined> {
  const response = await request.get(`${DECISION_URL}/v1/config`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const config = environmentConfigSchema.parse(await response.json());
  return config.flags.find((flag) => flag.key === 'new-banner')?.enabled;
}

test('AC-1.1, AC-1.2, AC-1.3 (console to decision): a flag changed on screen reaches /v1/config in under 5 s', async ({
  page,
  browser,
  request,
}) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_EMAIL);
  const devKey = await createApiKeyInUi(admin, 'e2e-dev', 'development');
  const prodKey = await createApiKeyInUi(admin, 'e2e-prod', 'production');
  await adminContext.close();
  expect(await bannerEnabled(request, devKey)).toBe(false);
  expect(await bannerEnabled(request, prodKey)).toBe(false);

  await signIn(page, EDITOR_EMAIL);
  await openFlag(page, 'new-banner');

  await page.getByLabel('Ligada em development').check();
  const turnedOn = Date.now();
  await page.getByRole('button', { name: 'Salvar development' }).click();
  await expect.poll(() => bannerEnabled(request, devKey), { timeout: 5_000 }).toBe(true);
  expect(Date.now() - turnedOn).toBeLessThan(5_000);

  // AC-1.3: production is untouched.
  expect(await bannerEnabled(request, prodKey)).toBe(false);

  await page.getByLabel('Ligada em development').uncheck();
  await page.getByRole('button', { name: 'Salvar development' }).click();
  await expect.poll(() => bannerEnabled(request, devKey), { timeout: 5_000 }).toBe(false);

  // FR-010, AC-6.1: the change is in the history of the flag, with its author.
  await page.reload();
  await expect(page.getByText(`${EDITOR_EMAIL} alterou`).first()).toBeVisible();
});

test('AC-1.4: the console rejects a value that does not match the flag type', async ({ page }) => {
  await signIn(page, EDITOR_EMAIL);
  await page.goto('/projects/demo-store/flags');
  await page.getByLabel('Chave').fill('max-items');
  await page.getByLabel('Tipo').selectOption('number');
  await page.getByLabel('Valor padrão').fill('muitos');
  await page.getByRole('button', { name: 'Criar flag' }).click();
  // The form error, not the route announcer that Next.js also renders with role=alert.
  await expect(page.locator('form [role=alert]')).toBeVisible();

  await page.getByLabel('Valor padrão').fill('10');
  await page.getByLabel('Tipo').selectOption('number');
  await page.getByRole('button', { name: 'Criar flag' }).click();
  await expect(page.getByRole('heading', { name: 'max-items' })).toBeVisible();
});

test('AC-3.1, AC-3.6: creates an experiment and blocks weight changes while it runs', async ({
  page,
}) => {
  await signIn(page, EDITOR_EMAIL);
  await page.goto('/projects/demo-store/experiments');
  await page.getByLabel('Chave', { exact: true }).fill('hero-copy');
  await page.getByLabel('Hipótese').fill('Um texto novo aumenta os cliques.');
  await page.getByRole('button', { name: 'Criar experimento' }).click();
  await expect(page.getByRole('heading', { name: 'hero-copy' })).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar em development' }).click();
  await expect(page.getByRole('note')).toContainText('em execução');
  await expect(page.getByLabel('Peso da variante 1 (%)')).toBeDisabled();

  await page.getByRole('button', { name: 'Pausar em development' }).click();
  await expect(page.getByRole('note')).toContainText('invalida a análise');
  await expect(page.getByLabel('Peso da variante 1 (%)')).toBeEnabled();
});
