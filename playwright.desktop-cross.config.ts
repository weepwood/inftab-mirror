import {defineConfig,devices} from '@playwright/test'
import base from './playwright.production.config'
export default defineConfig({
 ...base,
 projects:[
  {name:'firefox',use:{...devices['Desktop Firefox']}},
  {name:'webkit',use:{...devices['Desktop Safari']}},
 ],
 testMatch:['**/desktop-alpha2.spec.ts','**/desktop-storage.spec.ts'],
})
