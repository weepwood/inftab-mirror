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

test('stable browsers preserve Tab focus when leaving the search engine menu', async ({ page }) => {
  const picker = page.getByRole('button', { name: '当前搜索引擎：Baidu' })
  const search = page.getByRole('searchbox', { name: '输入并搜索' })

  await picker.click()
  await expect(page.getByRole('option', { name: /Baidu/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.engine-menu')).toHaveCount(0)
  await expect(search).toBeFocused()

  await picker.click()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.engine-menu')).toHaveCount(0)
  await expect(picker).toBeFocused()
})

test('stable browsers show focus and readable colors on native settings selects', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  const theme = settings.getByRole('combobox', { name: '颜色主题' })

  await theme.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(theme).toBeFocused()
  await expect.poll(() => theme.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px')
  await theme.selectOption('dark')
  await expect.poll(() => theme.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(37, 42, 52)')
  await expect.poll(() => theme.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(226, 230, 237)')
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

test('stable browsers load the enabled news widget with its source labels', async ({ page }) => {
  await page.route('https://hacker-news.firebaseio.com/v0/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: route.request().url().endsWith('/topstories.json')
      ? JSON.stringify([9201])
      : JSON.stringify({ id: 9201, type: 'story', title: 'Stable browser news story', url: 'https://stable-source.example/news', score: 11, descendants: 2 }),
  }))
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.getByLabel('显示热门资讯小组件').check()
  await settings.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="news-summary"]')
  await expect(widget).toContainText('Stable browser news story')
  await expect(widget.locator('.news-summary-attribution')).toContainText('Hacker News')
  await expect(widget.locator('.news-summary-list small')).toContainText('stable-source.example · 11 分 · 2 条讨论')
})
