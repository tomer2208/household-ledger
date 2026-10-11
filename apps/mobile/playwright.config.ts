// T2: end-to-end tests of the main flows, on the real web build against a local Supabase
// (`supabase start`), never the live project. Run with scripts/e2e.sh, which builds the app
// against the local stack first. Each flow runs in English and in Hebrew, at phone size.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4317',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    // the service worker would serve a cached shell between tests
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'en', use: { locale: 'en-US' } },
    { name: 'he', use: { locale: 'he-IL' } },
  ],
  webServer: { command: 'node e2e/serve.mjs', url: 'http://127.0.0.1:4317', reuseExistingServer: !process.env.CI },
});
