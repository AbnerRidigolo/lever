import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const ENV_FILE = '../../.env';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const { DECISION_URL, E2E_API_KEY, SDK_E2E_DATABASE_URL, STORE_URL } =
  await import('./e2e/sdk/env');

// E2E with the real @lever/sdk and decision service (store plan, T12). Run through
// `pnpm test:e2e:sdk`, which recreates the lever_store_e2e database first (e2e/prepare.ts).
export default defineConfig({
  testDir: './e2e/sdk',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: STORE_URL, trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'pt-BR' } }],
  webServer: [
    {
      command: 'node ../../services/decision/dist/main.js',
      url: `${DECISION_URL}/healthz`,
      reuseExistingServer: false,
      env: { DATABASE_URL: SDK_E2E_DATABASE_URL, DECISION_PORT: '4102', LOG_LEVEL: 'warn' },
    },
    {
      command: 'node node_modules/next/dist/bin/next start --port 3102',
      url: `${STORE_URL}/metrics`,
      reuseExistingServer: false,
      env: {
        STORE_SESSION_SECRET: 'e2e-fictitious-session-secret',
        LEVER_ADAPTER: 'sdk',
        LEVER_DECISION_URL: DECISION_URL,
        LEVER_API_KEY: E2E_API_KEY,
        LEVER_STUB_OVERRIDES: '',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});
