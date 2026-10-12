import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'stable-browser.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome-stable', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'edge-stable', use: { browserName: 'chromium', channel: 'msedge' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
