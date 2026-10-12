import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-extension',
  outputDir: 'test-results/extension',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
