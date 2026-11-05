// Fixed ids of the seed (packages/db/src/seed/data.ts). @lever/db exports `seed` but not these
// constants, and packages/db is shared, so the store E2E repeats the few it needs.
export const SEED = {
  project: '00000000-0000-4000-8000-000000000010',
  development: '00000000-0000-4000-8000-000000000020',
  newBannerFlag: '00000000-0000-4000-8000-000000000030',
  checkoutLayoutExperiment: '00000000-0000-4000-8000-000000000040',
} as const;
