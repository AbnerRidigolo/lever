import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const ENV_FILE = '../../.env';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const { CONSOLE_URL, DECISION_URL, E2E_DATABASE_URL } = await import('./e2e/env');

export default defineConfig({
  testDir: './e2e',
  // The tests share one database and one inbox.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: CONSOLE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node node_modules/next/dist/bin/next start --port 3100',
      url: `${CONSOLE_URL}/login`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        AUTH_URL: CONSOLE_URL,
        AUTH_TRUST_HOST: 'true',
      },
    },
    {
      command: 'node ../../services/decision/dist/main.js',
      url: `${DECISION_URL}/healthz`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        DECISION_PORT: '4100',
        // Short, so a revoked key stops working quickly in the test.
        API_KEY_CACHE_TTL_MS: '500',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});
