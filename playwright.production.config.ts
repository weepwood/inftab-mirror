import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

const baseURL = 'http://127.0.0.1:4174'

export default defineConfig({
  ...baseConfig,
  use: { ...baseConfig.use, baseURL },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
