import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ json: { results: [] } }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: {} }))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('stable browsers load the homepage and quick translation flow', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()
  await page.route('https://translate.google.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<title>Translation test</title>',
  }))
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('stable browser')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()
  await expect(page).toHaveURL(/translate\.google\.com\/\?sl=auto&tl=zh-CN&text=stable%20browser&op=translate/)
})

test('stable browsers persist a new shortcut after reload at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Stable Browser')
  await dialog.getByPlaceholder('https://example.com').fill('https://stable.example/')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('Stable Browser')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Stable Browser')
  await expect(page.getByRole('option', { name: /Stable Browser/ })).toBeVisible()
})
