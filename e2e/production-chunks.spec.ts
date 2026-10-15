import { expect, test, type Page } from '@playwright/test'

const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
})

test('quick translation retries a failed production chunk and opens the encoded query', async ({ page }) => {
  let translationChunkAttempts = 0
  await page.route('**/assets/translation-*.js', async (route) => {
    translationChunkAttempts += 1
    if (translationChunkAttempts === 1) return route.fulfill({ status: 503, body: 'temporary failure' })
    await route.continue()
  })
  await page.route('https://translate.google.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<title>Translation test</title>',
  }))
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('hello & 世界')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()

  await expect(page).toHaveURL(/translate\.google\.com\/\?sl=auto&tl=zh-CN&text=hello%20%26%20%E4%B8%96%E7%95%8C&op=translate/)
  await expect(page).toHaveTitle('Translation test')
  expect(translationChunkAttempts).toBe(2)
})

test('quick translation keeps the query that was submitted while its chunk loads', async ({ page }) => {
  let releaseChunk!: () => void
  let chunkRequested!: () => void
  const chunkRequest = new Promise<void>((resolve) => { chunkRequested = resolve })
  const chunkGate = new Promise<void>((resolve) => { releaseChunk = resolve })
  await page.route('**/assets/translation-*.js', async (route) => {
    chunkRequested()
    await chunkGate
    await route.continue()
  })
  await page.route('https://translate.google.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<title>Translation test</title>',
  }))
  const search = page.getByRole('searchbox', { name: '输入并搜索' })
  await search.fill('first query')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()
  await chunkRequest
  await search.fill('second query')
  releaseChunk()

  await expect(page).toHaveURL(/translate\.google\.com\/\?sl=auto&tl=zh-CN&text=first%20query&op=translate/)
})

test('quick translation reports an exhausted production chunk without an unhandled page error', async ({ page }) => {
  await page.route('**/assets/translation-*.js', (route) => route.fulfill({ status: 503, body: 'offline' }))
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('hello')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()

  await expect(page.getByRole('status').filter({ hasText: '翻译工具暂时无法加载' })).toBeVisible()
})

test('loads the panel plugin registry only after a panel is opened', async ({ page }) => {
  const registryRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/registry-[^/]+\.js(?:\?|$)/.test(request.url())) registryRequests.push(request.url())
  })
  await expect(page.locator('main.home')).toBeVisible()
  expect(registryRequests).toEqual([])

  await page.locator('header').getByRole('button', { name: '打开设置' }).click()
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
  expect(registryRequests).toHaveLength(1)
})

test('retries a transient production homepage widget chunk failure', async ({ page }) => {
  let chunkRequests = 0
  await page.route(/\/HomeWidgetShelf-[^/]+\.js(?:\?.*)?$/, async (route) => {
    chunkRequests += 1
    if (chunkRequests === 1) await route.abort('failed')
    else await route.continue()
  })
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, homeWidgetIds: ['todo-summary'] }))
  })
  await page.reload()

  await expect(page.locator('[data-widget-id="todo-summary"]')).toBeVisible()
  expect(chunkRequests).toBeGreaterThanOrEqual(2)
})
