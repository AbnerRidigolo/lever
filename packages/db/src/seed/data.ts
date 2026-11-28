import {
  experimentDefinitionSchema,
  experimentMetricsSchema,
  experimentPlanSchema,
  flagDefinitionSchema,
  flagEnvironmentSettingsSchemaFor,
  metricDefinitionSchema,
  type EnvironmentKey,
  type ExperimentStatus,
} from '@lever/schemas';

// Fictitious demo data. Fixed ids and salts keep the seed reproducible and idempotent.

export const SEED_IDS = {
  adminUser: '00000000-0000-4000-8000-000000000001',
  project: '00000000-0000-4000-8000-000000000010',
  adminMembership: '00000000-0000-4000-8000-000000000011',
  environments: {
    development: '00000000-0000-4000-8000-000000000020',
    production: '00000000-0000-4000-8000-000000000021',
  },
  configVersions: {
    development: '00000000-0000-4000-8000-000000000025',
    production: '00000000-0000-4000-8000-000000000026',
  },
  newBannerFlag: '00000000-0000-4000-8000-000000000030',
  newBannerFlagEnvironments: {
    development: '00000000-0000-4000-8000-000000000031',
    production: '00000000-0000-4000-8000-000000000032',
  },
  checkoutLayoutExperiment: '00000000-0000-4000-8000-000000000040',
  checkoutLayoutVariants: {
    'one-page': '00000000-0000-4000-8000-000000000041',
    'multi-step': '00000000-0000-4000-8000-000000000042',
  },
  checkoutLayoutEnvironments: {
    development: '00000000-0000-4000-8000-000000000043',
    production: '00000000-0000-4000-8000-000000000044',
  },
  audit: {
    newBannerCreated: '00000000-0000-4000-8000-000000000050',
    checkoutLayoutCreated: '00000000-0000-4000-8000-000000000051',
  },
  metrics: {
    'checkout-conversion': '00000000-0000-4000-8000-000000000060',
    'revenue-per-user': '00000000-0000-4000-8000-000000000061',
    'add-to-cart-rate': '00000000-0000-4000-8000-000000000062',
    'checkout-error-rate': '00000000-0000-4000-8000-000000000063',
  },
  checkoutLayoutMetrics: {
    'checkout-conversion': '00000000-0000-4000-8000-000000000064',
    'revenue-per-user': '00000000-0000-4000-8000-000000000065',
    'add-to-cart-rate': '00000000-0000-4000-8000-000000000066',
    'checkout-error-rate': '00000000-0000-4000-8000-000000000067',
  },
  metricAudit: {
    'checkout-conversion': '00000000-0000-4000-8000-000000000068',
    'revenue-per-user': '00000000-0000-4000-8000-000000000069',
    'add-to-cart-rate': '00000000-0000-4000-8000-00000000006a',
    'checkout-error-rate': '00000000-0000-4000-8000-00000000006b',
  },
} as const;

export const SEED_CREATED_AT = new Date('2026-10-29T00:00:00.000Z');

export const seedAdmin = {
  id: SEED_IDS.adminUser,
  email: 'admin@lever.local',
  name: 'Admin Demo',
  image: null,
};

export const seedProject = {
  id: SEED_IDS.project,
  name: 'Lever Demo Store',
  slug: 'demo-store',
};

export const newBannerFlag = {
  id: SEED_IDS.newBannerFlag,
  salt: 'seed-new-banner-5f2c8d1a',
  ...flagDefinitionSchema.parse({ key: 'new-banner', type: 'boolean', defaultValue: false }),
};

/** Off in both environments, ready for AC-1.1: turning it on serves `true` to everyone. */
export const newBannerSettings = flagEnvironmentSettingsSchemaFor('boolean').parse({
  enabled: false,
  servedValue: true,
  rolloutBps: 10_000,
  segmentKey: null,
});

export const checkoutLayoutExperiment = {
  id: SEED_IDS.checkoutLayoutExperiment,
  salt: 'seed-checkout-layout-9b7e3f04',
  status: 'running' as const satisfies ExperimentStatus,
  startedAt: SEED_CREATED_AT,
  ...experimentDefinitionSchema.parse({
    key: 'checkout-layout',
    hypothesis:
      'A multi-step checkout increases the conversion rate compared with the one-page checkout.',
    variants: [
      { key: 'one-page', weightBps: 5_000, isControl: true },
      { key: 'multi-step', weightBps: 5_000, isControl: false },
    ],
    segmentKey: null,
  }),
};

/** Running locally so the store shows both variants; still a draft in production. */
export const checkoutLayoutStatusByEnvironment = {
  development: 'running',
  production: 'draft',
} as const satisfies Record<EnvironmentKey, ExperimentStatus>;

/** Demo metric catalog (002/AC-4.1). Keys match `SEED_IDS.metrics`. */
export const seedMetrics = [
  metricDefinitionSchema.parse({
    key: 'checkout-conversion',
    name: 'Checkout conversion',
    type: 'conversion',
    eventName: 'purchase',
    direction: 'increase',
  }),
  metricDefinitionSchema.parse({
    key: 'revenue-per-user',
    name: 'Revenue per user',
    type: 'mean',
    eventName: 'purchase',
    valueProperty: 'revenueCents',
    direction: 'increase',
  }),
  metricDefinitionSchema.parse({
    key: 'add-to-cart-rate',
    name: 'Add-to-cart rate',
    type: 'ratio',
    eventName: 'add_to_cart',
    denominatorEventName: 'product_view',
    direction: 'increase',
  }),
  metricDefinitionSchema.parse({
    key: 'checkout-error-rate',
    name: 'Checkout error rate',
    type: 'conversion',
    eventName: 'checkout_error',
    direction: 'decrease',
  }),
];

/** One primary, two secondary and one guardrail (002/AC-4.2). */
export const checkoutLayoutMetrics = experimentMetricsSchema.parse([
  { metricKey: 'checkout-conversion', role: 'primary' },
  { metricKey: 'revenue-per-user', role: 'secondary' },
  { metricKey: 'add-to-cart-rate', role: 'secondary' },
  { metricKey: 'checkout-error-rate', role: 'guardrail' },
]);

/** Reference case of 002/AC-5.1: 14,748 users per variant detect an absolute 1 p.p. lift. */
export const checkoutLayoutPlan = experimentPlanSchema.parse({
  plannedSampleSize: 14_748,
  mde: { kind: 'absolute', value: 0.01 },
});
