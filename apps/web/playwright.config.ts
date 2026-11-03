import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * E2E tests. By default they run against `next start` on port 3100 and need no API
 * (they cover routing, auth gating and static pages). Set E2E_BASE_URL to run
 * against an existing deployment, and E2E_EMAIL / E2E_PASSWORD to enable the
 * authenticated flows in e2e/authenticated.spec.ts.
 *
 * The preinstalled Chromium at /opt/pw-browsers is used when present (CI images
 * install browsers with `npx playwright install --with-deps chromium`).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const localChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync(localChromium) ? localChromium : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : undefined } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : undefined } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
