import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { MAILPIT_URL } from './env';

interface MailpitSearch {
  messages: { ID: string; Created: string }[];
}

/** The newest magic link sent to this address after `since`, read from the Mailpit inbox. */
async function magicLink(
  request: APIRequestContext,
  email: string,
  since: number,
): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const { messages } = (await response.json()) as MailpitSearch;
        id = messages.find((message) => Date.parse(message.Created) >= since)?.ID;
        return id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();

  const message = await request.get(`${MAILPIT_URL}/api/v1/message/${String(id)}`);
  const { Text: text } = (await message.json()) as { Text: string };
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  if (link === undefined) throw new Error('no link in the email');
  return link;
}

/** Signs in through the real magic link flow (AC-7.1). */
export async function signIn(page: Page, email: string): Promise<void> {
  const since = Date.now() - 2_000;
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar link de acesso' }).click();
  await expect(page.getByRole('status')).toContainText('Enviamos um link');

  await page.goto(await magicLink(page.request, email, since));
  await expect(page).toHaveURL(/\/projects$/);
}

export async function openFlag(page: Page, key: string): Promise<void> {
  await page.goto('/projects/demo-store/flags');
  await page.getByRole('link', { name: key, exact: true }).click();
  await expect(page.getByRole('heading', { name: key })).toBeVisible();
}

export async function createApiKeyInUi(
  page: Page,
  name: string,
  environment: 'development' | 'production',
): Promise<string> {
  await page.goto('/projects/demo-store/api-keys');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Ambiente').selectOption(environment);
  await page.getByRole('button', { name: 'Criar API key' }).click();
  const key = await page.getByTestId('new-api-key').textContent();
  if (key === null) throw new Error('the new key was not shown');
  return key;
}
