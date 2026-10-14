import { expect, test, type Page } from '@playwright/test'

const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ json: { results: [] } }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: {} }))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
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

test('stable browsers reject malformed backups before preview or import', async ({ page }) => {
  const shortcutId = `must-not-import-${Date.now()}`
  const backup = {
    format: 'inftab-workspace',
    version: 1,
    preferences: { engine: 'baidu', mode: 'html', wallpaper: '/wallpapers/forest.webp' },
    shortcuts: [{ id: shortcutId, title: 'Must not import', url: 'https://example.com/', color: '#abc', mark: 'M' }],
    folders: null,
    launcherOrder: [shortcutId],
    todos: [],
    notes: [],
    activeNoteId: '',
    weatherCity: '上海',
  }

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.locator('input[accept="application/json,.json"]').setInputFiles({
    name: 'malformed-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  await expect(settings.getByRole('alert')).toContainText('备份中的文件夹数量无效')
  await expect(page.getByRole('dialog', { name: '恢复本地备份' })).toHaveCount(0)
  expect(await page.evaluate((id) => localStorage.getItem('inftab.shortcuts.v1')?.includes(id) ?? false, shortcutId)).toBe(false)
})

test('stable browsers restore and reload a confirmed valid backup', async ({ page }) => {
  const backup = {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: '2026-10-14T00:00:00.000Z',
    preferences: {
      engine: 'baidu', mode: 'html', wallpaper: '/wallpapers/forest.webp', customWallpaper: '',
      shade: 0.2, iconSize: 96, columns: 6, showNames: true, iconRadius: 50,
    },
    shortcuts: [{ id: 'stable-restored-shortcut', title: 'Stable Restored', url: 'https://stable-restored.example/', color: '#abc', mark: 'R' }],
    folders: [],
    launcherOrder: ['stable-restored-shortcut'],
    todos: [{ id: 'stable-restored-todo', title: 'Stable restored todo', done: false }],
    habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', customSearchEngines: [],
    homeWorkspaces: [{ id: 'default', name: '主页', itemIds: ['stable-restored-shortcut'] }],
    activeHomeWorkspaceId: 'default',
  }

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  const shortcutsBeforeImport = await page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))
  await settings.locator('input[accept="application/json,.json"]').setInputFiles({
    name: 'valid-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  const preview = page.getByRole('dialog', { name: '恢复本地备份' })
  await expect(preview).toContainText('1 个快捷入口')
  expect(await page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toBe(shortcutsBeforeImport)
  await preview.getByRole('button', { name: '覆盖导入' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('stable-restored-shortcut')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.todos.v1'))).toContain('Stable restored todo')

  await page.reload()
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Stable Restored')
  await expect(page.getByRole('option', { name: /Stable Restored/ })).toBeVisible()
})

test('stable browsers open every shortcut in a folder from one click', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '新建文件夹' }).click()
  const editor = page.getByRole('dialog', { name: '新建文件夹' })
  await editor.getByLabel('文件夹名称').fill('批量打开')
  await editor.getByRole('checkbox', { name: /京东商城/ }).check()
  await editor.getByRole('checkbox', { name: /天猫精选/ }).check()
  await editor.getByRole('button', { name: '保存文件夹' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('button', { name: '打开批量打开' }).click()
  const folder = page.getByRole('dialog', { name: '批量打开' })
  const openedPages: Page[] = []
  page.context().on('page', (openedPage) => openedPages.push(openedPage))

  await folder.getByRole('button', { name: '打开全部' }).click()
  await expect.poll(() => openedPages.length).toBe(2)
  expect(openedPages.map((openedPage) => openedPage.url()).sort()).toEqual([
    'https://www.jd.com/',
    'https://www.tmall.com/',
  ])
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
