import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';

import { STORE_URL } from '../env';
import { fillCart } from '../helpers';

import { setCheckoutStatus } from './db';
import { AUTHOR_PENDING_REASON, AUTHOR_READY } from './env';

// Needs evaluateExperiment from @lever/evaluation: until then every user gets the control.
test.skip(!AUTHOR_READY, AUTHOR_PENDING_REASON);

const USERS = Array.from(
  { length: 20 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);

async function layoutOf(
  context: BrowserContext,
  request: APIRequestContext,
  uid: string,
): Promise<string> {
  await context.addCookies([{ name: 'lever_uid', value: uid, url: STORE_URL }]);
  const html = await (await request.get('/checkout')).text();
  const layout = /data-checkout-layout="([a-z-]+)"/.exec(html)?.[1];
  if (layout === undefined) throw new Error('checkout without a layout');
  return layout;
}

test.afterEach(async () => {
  await setCheckoutStatus('running');
});

test('AC-8.3, AC-3.3: users fall in both layouts and each one keeps theirs', async ({
  page,
  context,
}) => {
  await fillCart(context);
  const first = new Map<string, string>();
  for (const uid of USERS) first.set(uid, await layoutOf(context, page.request, uid));

  expect(new Set(first.values())).toEqual(new Set(['one-page', 'multi-step']));
  for (const uid of USERS) expect(await layoutOf(context, page.request, uid)).toBe(first.get(uid));
});

test('AC-3.5: with the experiment paused, everyone gets the control layout', async ({
  page,
  context,
}) => {
  await fillCart(context);
  await setCheckoutStatus('paused');
  await expect(async () => {
    for (const uid of USERS) expect(await layoutOf(context, page.request, uid)).toBe('one-page');
  }).toPass({ timeout: 5_000, intervals: [250] });
});
