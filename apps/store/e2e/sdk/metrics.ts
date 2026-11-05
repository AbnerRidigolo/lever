import type { APIRequestContext } from '@playwright/test';

/** Value of a `source="lever"` gauge in the store's /metrics, or null without a sample. */
export async function storeGauge(request: APIRequestContext, name: string): Promise<number | null> {
  const text = await (await request.get('/metrics')).text();
  const line = text.split('\n').find((row) => row.startsWith(`${name}{source="lever"} `));
  return line === undefined ? null : Number(line.split(' ')[1]);
}
