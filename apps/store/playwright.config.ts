import { defineConfig, devices } from '@playwright/test';

import { STORE_URL } from './e2e/env';

// E2E with the stub adapter: no decision service and no database (store plan, section 6).
export default defineConfig({
  testDir: './e2e',
  // The flows with the real SDK have their own config (playwright.sdk.config.ts).
  testIgnore: ['sdk/**'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: STORE_URL, trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'pt-BR' } }],
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --port 3102',
    url: `${STORE_URL}/metrics`,
    reuseExistingServer: false,
    env: {
      STORE_SESSION_SECRET: 'e2e-fictitious-session-secret',
      LEVER_ADAPTER: 'stub',
      // Only the per-browser overrides of each test apply.
      LEVER_STUB_OVERRIDES: '',
      LOG_LEVEL: 'warn',
    },
  },
});
