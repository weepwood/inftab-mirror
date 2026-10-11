import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({
    json: { results: [{ id: 1, name: '上海', admin1: '上海', country: '中国', latitude: 31.2, longitude: 121.5 }] },
  }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({
    json: {
      current: {
        temperature_2m: 20, apparent_temperature: 20, relative_humidity_2m: 50,
        weather_code: 1, wind_speed_10m: 5, time: '2026-10-12T12:00',
      },
      daily: {
        time: ['2026-10-12'], weather_code: [1], temperature_2m_max: [22], temperature_2m_min: [18],
      },
    },
  }))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('creates a shortcut and keeps it after reloading the new tab', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()

  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('E2E Example')
  await dialog.getByPlaceholder('https://example.com').fill('https://example.org/path')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('E2E Example')
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByRole('button', { name: '打开E2E Example' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByRole('button', { name: '打开E2E Example' })).toBeVisible()
})

test('keyboard launcher search opens the matching built-in panel', async ({ page }) => {
  await page.keyboard.press('Control+f')
  const search = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await expect(search).toBeFocused()
  await search.fill('天气')
  await page.getByRole('option', { name: /天气/ }).click()

  await expect(page.getByRole('dialog', { name: '天气' })).toBeVisible()
  await expect(page.getByText('天气数据来自 Open-Meteo')).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('settings persist and the main view fits a narrow viewport', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const showClock = page.getByLabel('显示时间和日期')
  await showClock.uncheck()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText(/\d{2}:\d{2}/)).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  await page.reload()
  await expect(page.getByText(/\d{2}:\d{2}/)).toHaveCount(0)
})
