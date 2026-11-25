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

test('quick translation recovers a cached production chunk failure and opens the encoded query', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showSearchBar: true })))
  await page.reload()
  let translationChunkAttempts = 0
  let failTranslationChunk = true
  await page.route('**/assets/translation-*.js', async (route) => {
    translationChunkAttempts += 1
    if (failTranslationChunk) return route.fulfill({ status: 503, body: 'temporary failure' })
    await route.continue()
  })
  await page.route('https://translate.google.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<title>Translation test</title>',
  }))
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('hello & 世界')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()

  await expect(page.getByRole('status').filter({ hasText: '翻译工具暂时无法加载' })).toBeVisible()
  // A document reload clears the browser's failed native import() cache.
  failTranslationChunk = false
  const failedTranslationRequests = translationChunkAttempts
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click()
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('hello & 世界')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()

  await expect(page).toHaveURL(/translate\.google\.com\/\?sl=auto&tl=zh-CN&text=hello%20%26%20%E4%B8%96%E7%95%8C&op=translate/)
  await expect(page).toHaveTitle('Translation test')
  expect(translationChunkAttempts).toBe(failedTranslationRequests + 1)
})

test('quick translation keeps the query that was submitted while its chunk loads', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showSearchBar: true })))
  await page.reload()
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
  await page.evaluate(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showSearchBar: true })))
  await page.reload()
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

test('offline tools share a lazy chunk without adding homepage requests', async ({ page }) => {
  const toolRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/local-tools-[^/]+\.js(?:\?|$)/.test(request.url())) toolRequests.push(request.url())
  })
  await page.reload()
  await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toBeVisible()
  expect(toolRequests).toEqual([])

  for (const [title, content] of [
    ['待办事项', '.todo-content'], ['笔记', '.notes-layout'],
    ['日历', '.calendar-content'], ['纪念日', '.countdown-content'],
    ['计算器', '.calculator-content'], ['专注计时', '.focus-timer-content'],
  ] as const) {
    await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
    await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill(title)
    await page.getByRole('option', { name: title, exact: true }).click()
    const panel = page.getByRole('dialog', { name: title === '纪念日' ? '纪念日与倒计时' : title, exact: true })
    // The header can render before the async component starts loading.
    await expect(panel.locator(content)).toBeVisible()
    await expect.poll(() => toolRequests.length).toBe(1)
    await panel.getByRole('button', { name: '关闭', exact: true }).click()
  }
})

test('recovers a cached production homepage widget chunk failure after reloading', async ({ page }) => {
  let chunkRequests = 0
  let failWidgetChunk = true
  await page.route(/\/HomeWidgetShelf-[^/]+\.js(?:\?.*)?$/, async (route) => {
    chunkRequests += 1
    if (failWidgetChunk) await route.abort('failed')
    else await route.continue()
  })
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, homeWidgetIds: ['todo-summary'] }))
  })
  await page.reload()

  await expect(page.getByRole('alert').filter({ hasText: '首页组件暂时无法加载' })).toBeVisible()
  failWidgetChunk = false
  const failedWidgetRequests = chunkRequests
  await page.getByRole('button', { name: '重新加载页面', exact: true }).click()
  await expect(page.locator('[data-widget-id="todo-summary"]')).toBeVisible()
  expect(chunkRequests).toBeGreaterThan(failedWidgetRequests)
})

test('launcher search stays lazy and safely ignores Enter until visible results are ready', async ({ page }) => {
  const searchRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/LauncherSearchResults-[^/]+\.js(?:\?|$)/.test(request.url())) searchRequests.push(request.url())
  })
  await page.reload()
  await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toBeVisible()
  expect(searchRequests).toEqual([])

  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/assets/LauncherSearchResults-*.js', async (route) => {
    await gate
    await route.continue()
  })
  try {
    await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
    const input = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
    await input.fill('no-result-while-loading')
    await expect(page.getByRole('status').filter({ hasText: '正在加载入口查找' })).toBeVisible()
    await input.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await input.fill('计算器')
    release()
    await expect(page.getByRole('option', { name: '计算器', exact: true })).toBeVisible()
    await input.press('Enter')
    await expect(page.getByRole('dialog', { name: '计算器', exact: true }).locator('.calculator-content')).toBeVisible()
    expect(searchRequests).toHaveLength(1)
  } finally { release() }
})

for (const showSearchBar of [false, true]) test(`launcher search can leave a failed chunk and recover after a document reload (persistent search: ${showSearchBar})`, async ({ page }) => {
  await page.evaluate(showSearchBar => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showSearchBar })), showSearchBar)
  await page.reload()
  let fail = true
  await page.route('**/assets/LauncherSearchResults-*.js', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: 'offline' })
    else await route.continue()
  })
  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '入口查找暂时无法加载' })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('计算器')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '退出快捷入口搜索', exact: true }).click()
  if (showSearchBar) {
    await expect(page.getByRole('searchbox', { name: '输入并搜索' })).toBeFocused()
  } else {
    await expect(page.locator('.search-area')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '查找快捷入口', exact: true })).toBeFocused()
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  fail = false
  await page.reload()
  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('计算器')
  await expect(page.getByRole('option', { name: '计算器', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '计算器', exact: true }).locator('.calculator-content')).toBeVisible()
})

test('widget and browser-tool groups download only on demand without mounting sibling views', async ({ page }) => {
  const groups: string[] = []
  page.on('request', (request) => {
    const group = /\/assets\/(local-widgets|browser-widgets|browser-tools)-[^/]+\.js(?:\?|$)/.exec(request.url())?.[1]
    if (group) groups.push(group)
  })
  await page.reload()
  await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toBeVisible()
  expect(groups).toEqual([])
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'))
    const key = 'inftab.preferences.v1'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), homeWidgetIds: ['todo-summary'] }))
  })
  await page.reload()
  await expect(page.getByRole('textbox', { name: '快速添加待办', exact: true })).toBeVisible()
  expect(groups).toEqual(['local-widgets'])
  await expect(page.locator('.home-widget-card')).toHaveCount(1)
  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('书签')
  await page.getByRole('option', { name: '书签', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '浏览器书签', exact: true }).getByText('此功能需要浏览器扩展', { exact: true })).toBeVisible()
  expect(groups).toEqual(['local-widgets', 'browser-tools'])
  await expect(page.locator('.home-widget-card')).toHaveCount(1)
})

test('shortcut editor stays lazy while its native modal remains usable during loading', async ({ page }) => {
  let requests = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/assets/local-editors-*.js', async (route) => {
    requests += 1
    await gate
    await route.continue()
  })
  await page.reload()
  await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
  expect(requests).toBe(0)
  await page.locator('.home-actions').getByRole('button', { name: '打开设置', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(panel.locator('.settings-content')).toBeVisible()
  expect(requests).toBe(0)
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  const trigger = page.getByRole('button', { name: '新建快捷入口', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await expect(dialog.getByRole('status')).toContainText('正在加载快捷入口表单')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await expect.poll(() => dialog.evaluate((element) => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  release()
  await trigger.click()
  await expect(dialog.locator('#shortcut-name')).toBeFocused()
  expect(requests).toBe(1)
})

test('a failed shortcut editor can be dismissed safely and recovers after an explicit reload', async ({ page }) => {
  let failing = true
  await page.route('**/assets/local-editors-*.js', (route) => failing
    ? route.fulfill({ status: 503, body: 'offline' })
    : route.continue())
  const trigger = page.getByRole('button', { name: '新建快捷入口', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('快捷入口表单暂时无法加载')
  await expect(dialog.getByRole('button', { name: '重试加载', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(dialog.getByRole('button', { name: '重新加载页面', exact: true })).toBeVisible()
  failing = false
  await dialog.getByRole('button', { name: '重新加载页面', exact: true }).click()
  await trigger.click()
  await expect(dialog.locator('#shortcut-name')).toBeFocused()
})

test('default homepage does not fetch the optional clock until enabled', async ({ page }) => {
  const clockRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/ClockWidget-[^/]+\.js(?:\?|$)/i.test(request.url())) clockRequests.push(request.url())
  })
  await page.reload()
  await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toBeVisible()
  await expect(page.locator('.home-clock')).toHaveCount(0)
  expect(clockRequests).toEqual([])
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示时间和日期').check()
  await expect(page.locator('.home-clock')).toBeVisible()
  expect(clockRequests).toHaveLength(1)
})

test('default launcher only fetches the search component when requested', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (/\/assets\/SearchBar-[^/]+\.js(?:\?|$)/.test(request.url())) requests.push(request.url()) })
  await page.reload()
  await expect(page.locator('.shortcut-grid-viewport')).toBeVisible()
  expect(requests).toHaveLength(0)
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })).toBeFocused()
  expect(requests).toHaveLength(1)
})

test('desktop shell shares one lazy chunk and remains absent in classic mode',async({page})=>{
 const requests:string[]=[]
 page.on('request',request=>{
  if(/\/assets\/desktop-shell-[^/]+\.js(?:\?|$)/.test(request.url()))requests.push(request.url())
 })
 await page.reload()
 await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
 expect(requests).toEqual([])
 await page.locator('.home-actions').getByRole('button',{name:'打开设置',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'设置'})).toBeVisible()
 expect(requests).toEqual([])
 await page.getByRole('dialog',{name:'设置'}).getByRole('button',{name:'关闭',exact:true}).click()
 await page.getByRole('button',{name:'桌面模式',exact:true}).click()
 await expect(page.locator('.desktop-surface')).toBeVisible()
 await expect(page.getByRole('navigation',{name:'桌面功能菜单'})).toBeVisible()
 expect(requests).toHaveLength(1)
 await page.getByRole('button',{name:'经典模式',exact:true}).click()
 await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
 await page.getByRole('button',{name:'桌面模式',exact:true}).click()
 await expect(page.locator('.desktop-surface')).toBeVisible()
 expect(requests).toHaveLength(1)
})

test('desktop transactions stay out of classic startup and load with desktop mode',async({page})=>{
 const requests:string[]=[]
 page.on('request',request=>{if(/\/assets\/desktop-transactions-[^/]+\.js(?:\?|$)/.test(request.url()))requests.push(request.url())})
 await page.reload()
 await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
 expect(requests).toEqual([])
 await page.getByRole('button',{name:'桌面模式',exact:true}).click()
 await expect(page.locator('.desktop-surface')).toBeVisible()
 await expect.poll(()=>requests.length).toBe(1)
 await page.getByRole('button',{name:'Finder',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Finder 入口管理'})).toBeVisible()
 expect(requests).toHaveLength(1)
})
