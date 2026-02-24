/**
 * web/playwright.config.ts
 * Playwright E2E test configuration.
 *
 * Run e2e tests:
 *   npx playwright test            # headless
 *   npx playwright test --headed   # headed (see the browser)
 *   npx playwright test --ui       # interactive UI mode
 *
 * Prerequisites: server (8765), web dev server (5173), daemon (7878) all running.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  // Register ONE shared test user before all tests run
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: 'http://localhost:5173',
    // Launch a fresh browser context per test (isolated IndexedDB)
    storageState: undefined,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Don't start a web server here — assumes `pnpm dev` is already running
  // webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true }
})
