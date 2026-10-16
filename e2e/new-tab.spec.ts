import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = []
  pageErrorsByPage.set(page, pageErrors)
  page.on('pageerror', (error) => pageErrors.push(error.message))
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

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
})

// The workspace switcher is a circular control in the corner that fans open on hover/focus.
async function openWorkspaceMenu(page: Page) {
  await page.locator('.home-workspace-trigger').hover()
  await expect(page.locator('.home-workspace-bar')).toHaveClass(/is-open/)
}

// Chips are circles showing the first character; the full name stays on aria-label.
function workspaceChip(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

function workspaceNames(page: Page) {
  return page.locator('.home-workspace-tab').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
}

// Rename, move and delete live in the per-chip context menu.
async function openWorkspaceActions(page: Page, name: string) {
  await openWorkspaceMenu(page)
  await workspaceChip(page, name).click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
}

test('search engine menu keeps Tab focus in the search controls', async ({ page }) => {
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

test('horizontal arrows in composite menus do not turn the homepage', async ({ page }) => {
  const currentPage = page.locator('.page-dot[aria-current="page"]')
  const initialPage = await currentPage.getAttribute('aria-label')

  const enginePicker = page.getByRole('button', { name: '当前搜索引擎：Baidu' })
  await enginePicker.click()
  const engineOption = page.getByRole('option', { name: /Baidu/ })
  await engineOption.focus()
  await page.keyboard.press('ArrowRight')
  await expect(currentPage).toHaveAttribute('aria-label', initialPage!)
  await expect(engineOption).toBeFocused()
  await page.keyboard.press('Escape')

  const shortcut = page.locator('.shortcut-page[aria-hidden="false"] [data-item-id="jd"] .shortcut-open')
  await shortcut.focus()
  await page.keyboard.press('Shift+F10')
  const menuItem = page.getByRole('menuitem').first()
  await expect(menuItem).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(currentPage).toHaveAttribute('aria-label', initialPage!)
  await expect(menuItem).toBeFocused()
})

test('keyboard page turns keep focus on the corresponding shortcut', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    localStorage.setItem(key, JSON.stringify({ ...preferences, columns: 2, rows: 1, pageTransitionEffect: 'slide' }))
  })
  await page.reload()

  const activePage = page.locator('.shortcut-page[aria-hidden="false"]')
  const secondShortcut = activePage.locator('.shortcut-open').nth(1)
  await secondShortcut.focus()
  await page.keyboard.press('ArrowRight')

  await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', '第2页')
  await expect(page.locator('.shortcut-page[aria-hidden="false"] .shortcut-open').nth(1)).toBeFocused()
})

test('recovers the shortcut grid after its chunk fails and manual retry succeeds', async ({ page }) => {
  let chunkRequests = 0
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route(/(?:ShortcutGrid-[^/]+\.js|src\/components\/ShortcutGrid\.vue)(?:\?.*)?$/, async (route) => {
    chunkRequests += 1
    if (chunkRequests <= 3) await route.abort('failed')
    else await route.continue()
  })
  await page.reload()

  await expect(page.getByRole('alert').filter({ hasText: '快捷入口暂时无法加载' })).toBeVisible()
  await page.getByRole('button', { name: '重试加载' }).click()
  await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
  expect(chunkRequests).toBeGreaterThanOrEqual(4)
  expect(pageErrors).toEqual([])
})

test('creates a shortcut and keeps it after reloading the new tab', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()

  const dialog = page.locator('.shortcut-dialog')
  await expect(dialog.getByRole('button', { name: '从打开的标签页导入' })).toHaveCount(0)
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

test('accepts and preserves shortcut titles up to the shared 80-character limit', async ({ page }) => {
  const title = '长'.repeat(80)
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  const titleInput = dialog.getByPlaceholder('例如：GitHub')
  await expect(titleInput).toHaveAttribute('maxlength', '80')
  await titleInput.pressSequentially(title)
  await expect(titleInput).toHaveValue(title)
  await dialog.getByPlaceholder('https://example.com').fill('https://long-title.example/')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const shortcuts = JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as Array<{ title: string; url: string }>
    return shortcuts.some((item) => item.title === '长'.repeat(80) && item.url === 'https://long-title.example/')
  })).toBe(true)
})

test('creates and restores a shortcut when native randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined })
  })
  await page.reload()

  await expect.poll(() => page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
  await expect.poll(() => page.evaluate(() => typeof crypto.getRandomValues)).toBe('function')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Fallback ID Example')
  await dialog.getByPlaceholder('https://example.com').fill('https://fallback-id.example/')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('Fallback ID Example')
  const shortcutId = await page.evaluate(() => {
    const shortcuts = JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as Array<{ id: string; title: string }>
    return shortcuts.find((shortcut) => shortcut.title === 'Fallback ID Example')?.id
  })
  expect(shortcutId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i)

  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await page.reload()
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Fallback ID Example')
  await expect(page.getByRole('option', { name: /Fallback ID Example/ })).toBeVisible()
})

test('shortcut dialog traps keyboard focus, exposes dialog semantics, and restores its trigger', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  const addShortcut = settings.getByRole('button', { name: /添加快捷入口/ })
  await addShortcut.click()

  const dialog = page.getByRole('dialog', { name: '添加快捷入口' })
  const close = dialog.getByRole('button', { name: '关闭' })
  const name = dialog.getByPlaceholder('例如：GitHub')
  const last = dialog.getByRole('button', { name: '保存' })
  await expect(dialog).toBeVisible()
  await expect(name).toBeFocused()
  await expect(dialog.locator('input[type="file"]')).toHaveAttribute('tabindex', '-1')
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(addShortcut).toBeFocused()
})

test('touch shortcut dialog does not auto-focus a text field', async ({ page }) => {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => query === '(pointer: coarse)'
      ? {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => true,
        } as unknown as MediaQueryList
      : originalMatchMedia(query)
  })
  await page.reload()
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: /添加快捷入口/ }).click()

  const dialog = page.getByRole('dialog', { name: '添加快捷入口' })
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused()
  await expect(dialog.getByPlaceholder('例如：GitHub')).not.toBeFocused()
})

test('minimal mode keeps search available and restores the homepage with Escape', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({
    showSearchBar: false,
    homeWidgetIds: ['todo-summary'],
  })))
  await page.reload()
  await expect(page.getByRole('searchbox', { name: '输入并搜索' })).toHaveCount(0)
  await expect(page.locator('.home-widget-shelf')).toBeVisible()

  const enterMinimalMode = page.getByRole('button', { name: '进入极简模式' })
  await enterMinimalMode.click()
  await expect(page.getByRole('button', { name: '退出极简模式' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.home-widget-shelf')).toHaveCount(0)
  await expect(page.locator('.home-workspace-bar')).toHaveCount(0)
  await expect(page.locator('.shortcut-grid-wrap')).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: '输入并搜索' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '进入极简模式' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.home-widget-shelf')).toBeVisible()
  await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: '输入并搜索' })).toHaveCount(0)
})

test('workspace tabs isolate shortcuts and persist the active workspace', async ({ page }) => {
  await openWorkspaceMenu(page)
  await page.getByRole('button', { name: '新建工作区' }).click()
  await expect(page.getByRole('button', { name: '工作区 1', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Workspace only')
  await dialog.getByPlaceholder('https://example.com').fill('https://workspace.example/')
  await dialog.getByRole('button', { name: '保存' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  const shortcut = page.locator('.shortcut-cell').filter({ has: page.getByRole('button', { name: '打开Workspace only' }) })
  if (!(await shortcut.isVisible())) await page.getByRole('button', { name: '下一页' }).click()
  await shortcut.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '固定到 Dock' }).click()
  const dock = page.getByRole('navigation', { name: '常驻 Dock' })
  await expect(dock.getByRole('button', { name: '打开Workspace only' })).toBeVisible()

  await page.keyboard.press('Control+f')
  const localSearch = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await localSearch.fill('Workspace only')
  await expect(page.getByRole('option', { name: /Workspace only/ })).toBeVisible()

  await openWorkspaceMenu(page)
  await page.getByRole('button', { name: '主页', exact: true }).click()
  await expect(dock).toHaveCount(0)
  await localSearch.fill('Workspace only')
  await expect(page.locator('.local-search-empty')).toContainText('没有匹配的快捷入口')

  await openWorkspaceMenu(page)
  await page.getByRole('button', { name: '工作区 1', exact: true }).click()
  await expect(dock.getByRole('button', { name: '打开Workspace only' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '工作区 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Workspace only')
  await expect(page.getByRole('option', { name: /Workspace only/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开Workspace only' })).toBeVisible()

  await openWorkspaceActions(page, '工作区 1')
  await page.getByRole('menuitem', { name: '重命名' }).click()
  const workspaceName = page.getByRole('textbox', { name: '工作区名称' })
  await workspaceName.fill('娱乐')
  await workspaceName.press('Enter')
  await expect(workspaceChip(page, '娱乐')).toHaveAttribute('aria-pressed', 'true')
  await openWorkspaceActions(page, '娱乐')
  await page.getByRole('menuitem', { name: '删除' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '删除工作区？' })
  await expect(confirmation).toContainText('会移回“主页”')
  await confirmation.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('button', { name: '主页', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('option', { name: /Workspace only/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开Workspace only' })).toBeVisible()
})

test('workspace tabs can be reordered without moving the homepage and persist their order', async ({ page }) => {
  await openWorkspaceMenu(page)
  await page.getByRole('button', { name: '新建工作区' }).click()
  await page.getByRole('button', { name: '新建工作区' }).click()
  await expect.poll(() => workspaceNames(page)).toEqual(['主页', '工作区 1', '工作区 2'])

  await openWorkspaceActions(page, '工作区 2')
  await page.getByRole('menuitem', { name: '左移' }).click()

  await expect.poll(() => workspaceNames(page)).toEqual(['主页', '工作区 2', '工作区 1'])
  await expect(workspaceChip(page, '工作区 2')).toHaveAttribute('aria-pressed', 'true')
  // 工作区 2 now sits right after the pinned 主页, so it can no longer move left.
  await openWorkspaceActions(page, '工作区 2')
  await expect(page.getByRole('menuitem', { name: '左移' })).toBeDisabled()
  await page.reload()
  await expect.poll(() => workspaceNames(page)).toEqual(['主页', '工作区 2', '工作区 1'])
})

test('search submits an encoded query to the selected engine and category', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({
      ...preferences,
      visibleSearchModes: ['html', 'news'],
    }))
  })
  await page.reload()
  await page.route('https://www.bing.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>Mock search results</title>',
  }))

  const search = page.getByRole('searchbox', { name: '输入并搜索' })
  await page.getByRole('button', { name: '当前搜索引擎：Baidu' }).click()
  await page.getByRole('option', { name: /Bing/ }).click()
  await page.getByRole('button', { name: '新闻' }).click()
  await expect(page.getByRole('button', { name: '新闻' })).toHaveAttribute('aria-pressed', 'true')
  await search.fill('AI & privacy')
  await search.press('Enter')
  await expect(page).toHaveURL(/bing\.com\/news\/search\?q=AI%20%26%20privacy/)
})

test('restores a visible search category when stored preferences select a hidden one', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, mode: 'photos', visibleSearchModes: ['html', 'news'] }))
  })
  await page.reload()

  await expect(page.getByRole('button', { name: '网页' })).toHaveAttribute('aria-pressed', 'true')
  await page.route('https://www.baidu.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>Mock search results</title>',
  }))
  const search = page.getByRole('searchbox', { name: '输入并搜索' })
  await search.fill('visible category')
  await search.press('Enter')
  await expect(page).toHaveURL(/www\.baidu\.com\/s\?wd=visible%20category/)
})

test('a custom search engine can be added and used from the homepage', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByPlaceholder('例如：维基百科').fill('Example Search')
  await page.getByPlaceholder('https://example.com/search?q={query}').fill('https://search.example/find?q={query}')
  await page.getByRole('button', { name: '添加搜索引擎' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await page.route('https://search.example/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>Mock custom search results</title>',
  }))

  const search = page.getByRole('searchbox', { name: '输入并搜索' })
  await search.fill('Café & tea')
  await search.press('Enter')
  await expect(page).toHaveURL(/search\.example\/find\?q=Caf%C3%A9%20%26%20tea/)
})

test('exports in-memory edits after browser storage rejects a save', async ({ page }) => {
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === 'inftab.todos.v1') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return originalSetItem.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: '打开待办事项' }).click()
  const todoInput = page.getByRole('textbox', { name: '添加一项待办' })
  await todoInput.fill('Recover this unsaved note')
  await todoInput.press('Enter')
  await expect(page.locator('.storage-error-toast')).toContainText('本地数据未能保存')
  await page.getByRole('dialog', { name: '待办事项' }).getByRole('button', { name: '关闭' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.storage-error-toast').getByRole('button', { name: '导出备份' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const backup = JSON.parse(await readFile(path!, 'utf8')) as { todos: { title: string }[] }
  expect(backup.todos).toContainEqual(expect.objectContaining({ title: 'Recover this unsaved note' }))
  await expect(page.locator('.storage-error-toast')).toHaveCount(0)
})

test('clears a storage warning after the failed key saves successfully', async ({ page }) => {
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem
    let shouldFail = true
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === 'inftab.todos.v1' && shouldFail) throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return originalSetItem.call(this, key, value)
    }
    Object.defineProperty(window, '__setStorageWriteShouldFail', {
      configurable: true,
      value: (value: boolean) => { shouldFail = value },
    })
  })
  await page.getByRole('button', { name: '打开待办事项' }).click()
  const todoInput = page.getByRole('textbox', { name: '添加一项待办' })
  await todoInput.fill('Save again after storage recovers')
  await todoInput.press('Enter')
  await expect(page.locator('.storage-error-toast')).toContainText('本地数据未能保存')

  await page.evaluate(() => {
    (window as unknown as Window & { __setStorageWriteShouldFail: (value: boolean) => void })
      .__setStorageWriteShouldFail(false)
  })
  await page.getByRole('button', { name: '标记为完成' }).click()

  await expect(page.locator('.storage-error-toast')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.todos.v1'))).toContain('"done":true')
})

test('names backup downloads with the local date near UTC midnight', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai' })
  try {
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-10-12T16:30:00.000Z') })
    await page.goto('/')
    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '导出 JSON 备份' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('inftab-backup-2026-10-13.json')
  } finally {
    await context.close()
  }
})

test('restores a valid backup only after confirmation and keeps it after reload', async ({ page }) => {
  const backup = {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: '2026-10-14T00:00:00.000Z',
    preferences: {
      engine: 'baidu', mode: 'html', wallpaper: '/wallpapers/forest.webp', customWallpaper: '',
      shade: 0.2, iconSize: 96, columns: 6, showNames: true, iconRadius: 50,
    },
    shortcuts: [{ id: 'restored-shortcut', title: 'Restored Shortcut', url: 'https://restored.example/', color: '#abc', mark: 'R' }],
    folders: [],
    launcherOrder: ['restored-shortcut'],
    todos: [{ id: 'restored-todo', title: 'Restored todo', done: false }],
    habits: [], countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', customSearchEngines: [],
    homeWorkspaces: [{ id: 'default', name: '主页', itemIds: ['restored-shortcut'] }],
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
  await expect(preview).toContainText('1 条待办')
  expect(await page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toBe(shortcutsBeforeImport)
  await preview.getByRole('button', { name: '覆盖导入' }).click()

  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('restored-shortcut')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.todos.v1'))).toContain('Restored todo')
  await page.reload()
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Restored Shortcut')
  await expect(page.getByRole('option', { name: /Restored Shortcut/ })).toBeVisible()
})

test('backup import preview lists habits and home workspaces before restoring data', async ({ page }) => {
  const backup = {
    format: 'inftab-workspace',
    version: 1,
    exportedAt: '2026-10-12T00:00:00.000Z',
    preferences: {
      engine: 'baidu', mode: 'html', wallpaper: '/wallpapers/forest.webp', customWallpaper: '',
      shade: 0.2, iconSize: 96, columns: 6, showNames: true, iconRadius: 50,
    },
    shortcuts: [], folders: [], launcherOrder: [], todos: [],
    habits: [{ id: 'read', title: '阅读', completedDates: ['2026-10-12'] }],
    countdowns: [], notes: [], activeNoteId: '', weatherCity: '上海', customSearchEngines: [],
    focusTimer: { phase: 'focus', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, completedSessions: 0, remainingMs: 1_500_000, endsAt: null },
    homeWorkspaces: [
      { id: 'default', name: '主页', itemIds: [] },
      { id: 'work', name: '工作', itemIds: [] },
    ],
    activeHomeWorkspaceId: 'default',
  }
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.locator('input[accept="application/json,.json"]').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  const preview = page.getByRole('dialog', { name: '恢复本地备份' })
  await expect(preview).toContainText('2 个主页工作区')
  await expect(preview).toContainText('1 个习惯')
  await expect(preview).toContainText('包含专注计时状态')
  await preview.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('inftab.habits.v1'))).toBeNull()
})

test('malformed backup collections fail before preview or changing local data', async ({ page }) => {
  const shortcutId = `must-not-import-${Date.now()}`
  const backup = {
    format: 'inftab-workspace',
    version: 1,
    preferences: {
      engine: 'baidu', mode: 'html', wallpaper: '/wallpapers/forest.webp', customWallpaper: '',
      shade: 0.2, iconSize: 96, columns: 6, showNames: true, iconRadius: 50,
    },
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

test('backup import explains shortcut and folder ID collisions before preview', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  const downloadPromise = page.waitForEvent('download')
  await settings.getByRole('button', { name: '导出 JSON 备份' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const backup = JSON.parse(await readFile(path!, 'utf8')) as {
    shortcuts: { id: string; title: string; url: string; color: string; mark: string }[]
    folders: { id: string; title: string; shortcutIds: string[]; color: string; mark: string }[]
  }
  const duplicateId = `collision-${Date.now()}`
  backup.shortcuts.push({ id: duplicateId, title: 'Collision', url: 'https://collision.example/', color: '#abc', mark: 'C' })
  backup.folders.push({ id: duplicateId, title: 'Collision', shortcutIds: [], color: '#369', mark: 'F' })

  await settings.locator('input[accept="application/json,.json"]').setInputFiles({
    name: 'conflicting-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  await expect(settings.getByRole('alert')).toContainText('快捷入口与文件夹使用了相同的入口 ID')
  await expect(page.getByRole('dialog', { name: '恢复本地备份' })).toHaveCount(0)
})

test('shortcut deletion can be cancelled and requires confirmation', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Keep Until Confirmed')
  await dialog.getByPlaceholder('https://example.com').fill('https://example.org/keep')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('Keep Until Confirmed')
  const savedShortcutsBeforeCancel = await page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  const cell = page.locator('.shortcut-cell').filter({ has: page.getByRole('button', { name: '打开Keep Until Confirmed' }) })
  if (!(await cell.isVisible())) await page.getByRole('button', { name: '下一页' }).click()
  await cell.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除快捷入口' }).click()
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toContainText('Keep Until Confirmed')
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')))
    .toEqual(JSON.parse(savedShortcutsBeforeCancel ?? '[]'))

  await cell.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除快捷入口' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除' }).click()
  await expect(cell).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { title: string }[])
    .filter((shortcut) => shortcut.title === 'Keep Until Confirmed'))).toEqual([])
})

test('pointer dragging a built-in shortcut reorders and persists the launcher', async ({ page }) => {
  const source = page.locator('.shortcut-cell[data-item-id="weather"] .shortcut-open')
  const target = page.locator('.shortcut-cell[data-item-id="calendar"] .shortcut-open')
  await source.dragTo(target)

  const launcherOrder = () => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[])
  await expect.poll(async () => {
    const order = await launcherOrder()
    return order.indexOf('weather') < order.indexOf('calendar') && order.indexOf('weather') > 0
  }).toBe(true)

  await page.reload()
  await expect.poll(async () => {
    const order = await launcherOrder()
    return order.indexOf('weather') < order.indexOf('calendar') && order.indexOf('weather') > 0
  }).toBe(true)
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

test('every built-in panel route loads and closes without a runtime error', async ({ page }) => {
  const panelErrors: string[] = []
  page.on('pageerror', (error) => panelErrors.push(error.message))
  const routes = [
    ['weather', '天气'],
    ['countdowns', '纪念日与倒计时'],
    ['habits', '习惯打卡'],
    ['todos', '待办事项'],
    ['focus-timer', '专注计时'],
    ['notes', '笔记'],
    ['settings', '设置'],
    ['bookmarks', '浏览器书签'],
    ['history', '浏览历史'],
    ['calculator', '计算器'],
    ['calendar', '日历'],
  ] as const

  for (const [launcherId, title] of routes) {
    const trigger = page.locator(`[data-item-id="${launcherId}"] .shortcut-open`)
    await trigger.focus()
    await trigger.click()
    const panel = page.getByRole('dialog', { name: title })
    await expect(panel).toBeVisible()
    // Loading and terminal chunk-error states share this marker. Requiring it
    // to disappear ensures each lazy component actually mounted.
    await expect(panel.locator('.panel-loading')).toHaveCount(0)
    const firstFocusable = panel.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]):not(.visually-hidden)').first()
    const lastFocusable = panel.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]):not(.visually-hidden), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]):not(.visually-hidden)').last()
    await expect(firstFocusable).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(lastFocusable).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(firstFocusable).toBeFocused()
    await panel.getByRole('button', { name: '关闭' }).click()
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }

  await page.getByRole('button', { name: '下一页' }).click()
  await page.locator('[data-item-id="wallpapers"] .shortcut-open').click()
  const wallpaperSettings = page.getByRole('dialog', { name: '设置' })
  await expect(wallpaperSettings).toBeVisible()
  await expect(wallpaperSettings.locator('.panel-loading')).toHaveCount(0)
  await wallpaperSettings.getByRole('button', { name: '关闭' }).click()

  expect(panelErrors).toEqual([])
})

test('large local lists skip rendering offscreen rows without hiding their records', async ({ page }) => {
  test.setTimeout(60_000)
  await page.evaluate(() => {
    localStorage.setItem('inftab.todos.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: `todo-${index}`, title: `Task ${index}`, done: false,
    }))))
    localStorage.setItem('inftab.notes.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: `note-${index}`, title: `Note ${index}`, body: `Body ${index}`, updatedAt: index,
    }))))
    localStorage.setItem('inftab.active-note.v1', JSON.stringify('note-0'))
    localStorage.setItem('inftab.countdowns.v1', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      id: `countdown-${index}`, title: `Date ${index}`, date: `2027-01-${String(index % 28 + 1).padStart(2, '0')}`, recurrence: 'once',
    }))))
  })
  await page.reload()
  const search = async (term: string) => {
    await page.keyboard.press('Control+f')
    const input = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
    await input.fill(term)
    await page.getByRole('option', { name: new RegExp(term) }).click()
  }
  const assertVirtualizedRows = async (selector: string, expectedCount: number, expectedSize: string) => {
    const rows = page.locator(selector)
    await expect(rows).toHaveCount(expectedCount)
    await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).contentVisibility), { timeout: 15_000 }).toBe('auto')
    await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).containIntrinsicSize), { timeout: 15_000 }).toContain(expectedSize)
  }

  await search('待办事项')
  await assertVirtualizedRows('.todo-list li', 500, '47px')
  await page.getByRole('button', { name: '关闭' }).click()

  await search('笔记')
  await assertVirtualizedRows('.note-list-item', 500, '58px')
  await page.getByRole('button', { name: '关闭' }).click()

  await search('纪念日')
  await assertVirtualizedRows('.countdown-item', 500, '54px')
})

test('habit check-ins persist locally and appear in the homepage widget', async ({ page }) => {
  await page.locator('[data-item-id="habits"] .shortcut-open').click()
  const panel = page.getByRole('dialog', { name: '习惯打卡' })
  await panel.getByRole('textbox', { name: '添加一个习惯' }).fill('阅读')
  await panel.getByRole('button', { name: '添加习惯' }).click()
  await panel.getByRole('button', { name: '完成阅读今日打卡' }).click()
  await expect(panel.getByRole('status')).toContainText('今天完成 1 / 1')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.habits.v1') ?? '[]')))
    .toEqual([expect.objectContaining({ title: '阅读' })])
  await panel.getByRole('button', { name: '关闭' }).click()

  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, homeWidgetIds: ['habits-summary'] }))
  })
  await page.reload()
  const widget = page.locator('[data-widget-id="habits-summary"]')
  await expect(widget).toContainText('今天完成 1 / 1 个习惯')
  await widget.getByRole('button', { name: '打开习惯打卡' }).click()
  await expect(page.getByRole('dialog', { name: '习惯打卡' })).toBeVisible()
})

test('every home widget plugin loads together without a runtime error', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://hacker-news.firebaseio.com/v0/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: route.request().url().endsWith('/topstories.json')
      ? JSON.stringify([9001])
      : JSON.stringify({ id: 9001, type: 'story', title: 'Mocked technology story', url: 'https://source.example/story', score: 18, descendants: 3 }),
  }))
  const widgetIds = [
    'todo-summary',
    'habits-summary',
    'countdown-summary',
    'notes-summary',
    'calendar-summary',
    'weather-summary',
    'focus-timer-summary',
    'bookmarks-summary',
    'history-summary',
    'news-summary',
  ]
  await page.evaluate((ids) => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, homeWidgetIds: ids }))
  }, widgetIds)
  await page.reload()

  const shelf = page.getByRole('region', { name: '首页小组件' })
  await expect(shelf.locator('.home-widget-card')).toHaveCount(widgetIds.length)
  await expect(shelf.locator('.panel-loading')).toHaveCount(0)
  await expect.poll(() => shelf.locator('.home-widget-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-widget-id'))))
    .toEqual(widgetIds)
  expect(pageErrors).toEqual([])
})

test('news widget loads only after enabling it and labels the feed and article source', async ({ page }) => {
  let offline = false
  await page.route('https://hacker-news.firebaseio.com/v0/**', (route) => offline
    ? route.abort('internetdisconnected')
    : route.fulfill({
      contentType: 'application/json',
      body: route.request().url().endsWith('/topstories.json')
        ? JSON.stringify([9101])
        : JSON.stringify({ id: 9101, type: 'story', title: 'Opt-in news story', url: 'https://source.example/news', score: 42, descendants: 9 }),
    }))
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.getByLabel('显示热门资讯小组件').check()
  await settings.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="news-summary"]')
  await expect(widget).toContainText('Opt-in news story')
  await expect(widget.locator('.news-summary-attribution')).toContainText('Hacker News')
  await expect(widget.locator('.news-summary-list small')).toContainText('source.example · 42 分 · 9 条讨论')
  await expect(widget.locator('.news-summary-list a')).toHaveAttribute('href', 'https://source.example/news')

  offline = true
  await widget.getByRole('button', { name: '刷新资讯' }).click()
  await expect(widget).toContainText('资讯网络请求失败')
  await expect(widget).toContainText('Opt-in news story')
  await page.reload()
  await expect(page.locator('[data-widget-id="news-summary"]')).toContainText('Opt-in news story')
  await expect(page.locator('[data-widget-id="news-summary"]')).toContainText('最近更新')
})

test('launcher search shortcut works while the homepage search bar is hidden', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示搜索栏').uncheck()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.search-area')).toHaveCount(0)

  await page.keyboard.press('Control+f')
  const search = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await expect(search).toBeFocused()
  await search.fill('天气')
  await search.press('Enter')

  await expect(page.getByRole('dialog', { name: '天气' })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.locator('.search-area')).toHaveCount(0)
})

test('reduced-motion preference keeps page effects but caps their duration', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...preferences, columns: 2, rows: 1, pageTransitionEffect: 'particles', pageTransitionMs: 1800 }))
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()

  const track = page.locator('.shortcut-pages')
  await expect(track).toHaveClass(/particles-mode/)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', '第2页')
  // The effect is an explicit choice in settings, so it still plays under reduced motion.
  await expect(page.locator('#shortcut-particle-canvas')).toHaveCount(1)
  await expect(page.locator('.particles-out')).toHaveCount(1)
  await expect(page.locator('.particles-in')).toHaveCount(1)
  const entryDelays = await page.locator('.particles-in .shortcut-cell').evaluateAll((cells) =>
    cells.map((cell) => getComputedStyle(cell).animationDelay),
  )
  expect(new Set(entryDelays)).toEqual(new Set(['0s']))
  // Long configured durations are capped so the motion stays gentle.
  const outgoingStyle = await page.locator('.particles-out').evaluate((element) => element.getAttribute('style') ?? '')
  expect(outgoingStyle).toContain('--outgoing-duration: 1200ms')
})

test('settings persist and the main view fits a narrow viewport', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const showClock = page.getByLabel('显示时间和日期')
  await showClock.uncheck()
  await page.getByLabel('显示待办概览小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText(/\d{2}:\d{2}/)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '首页小组件' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  await page.reload()
  await expect(page.getByText(/\d{2}:\d{2}/)).toHaveCount(0)
  await expect(page.getByRole('region', { name: '首页小组件' })).toBeVisible()
})

test('the browser top-sites widget is opt-in and explains website limitations', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示常用网站小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="top-sites-summary"]')
  await expect(widget).toBeVisible()
  await expect(widget.getByText('此功能需要浏览器扩展')).toBeVisible()
  await expect(widget.getByRole('button', { name: '启用常用网站' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetIds))
    .toEqual(['top-sites-summary'])

  await page.reload()
  await expect(page.locator('[data-widget-id="top-sites-summary"]')).toBeVisible()
  await expect(page.locator('[data-widget-id="top-sites-summary"] .top-sites-summary-list')).toHaveCount(0)
})

test('unsafe wallpaper CSS from browser storage cannot trigger a hidden remote image request', async ({ page }) => {
  const remoteRequests: string[] = []
  await page.route('https://tracker.example/**', async (route) => {
    remoteRequests.push(route.request().url())
    await route.abort()
  })
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({
      ...preferences,
      customWallpaper: 'linear-gradient(red), url(https://tracker.example/pixel)',
    }))
  })
  await page.reload()

  await expect(page.locator('main.home')).toBeVisible()
  await expect.poll(() => page.locator('main.home').evaluate((element) => getComputedStyle(element).backgroundImage)).not.toContain('tracker.example')
  expect(remoteRequests).toEqual([])
})

test('protocol-relative shortcut icons from browser storage cannot trigger remote image requests', async ({ page }) => {
  const remoteRequests: string[] = []
  await page.route('**/pixel', async (route) => {
    remoteRequests.push(route.request().url())
    await route.abort()
  })
  await page.addInitScript(() => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([{
      id: 'imported-icon',
      title: 'Imported link',
      url: 'https://example.com/',
      color: '#abc',
      mark: 'I',
      icon: '//tracker.example/pixel',
    }]))
  })
  await page.goto('/')

  await expect(page.locator('main.home')).toBeVisible()
  await expect(page.locator('img.shortcut-picture[src*="tracker.example"]')).toHaveCount(0)
  expect(remoteRequests).toEqual([])
})

test('settings changes synchronize between open tabs', async ({ page }) => {
  const secondTab = await page.context().newPage()
  await secondTab.goto('/')
  await expect(secondTab.locator('.home-clock')).toBeVisible()

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示时间和日期').uncheck()

  await expect(page.locator('.home-clock')).toHaveCount(0)
  await expect(secondTab.locator('.home-clock')).toHaveCount(0)
  await expect.poll(() => secondTab.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').showClock))
    .toBe(false)
  await secondTab.reload()
  await expect(secondTab.locator('.home-clock')).toHaveCount(0)
  await secondTab.close()
})

test('selects a surviving note when its active note is deleted in another tab', async ({ page, context }) => {
  await page.evaluate(() => {
    localStorage.setItem('inftab.notes.v1', JSON.stringify([
      { id: 'note-first', title: 'First note', body: 'Keep this note', updatedAt: 1 },
      { id: 'note-active', title: 'Active note', body: 'Delete this note', updatedAt: 2 },
    ]))
    localStorage.setItem('inftab.active-note.v1', JSON.stringify('note-active'))
  })
  await page.reload()
  const secondTab = await context.newPage()
  await secondTab.goto('/')
  await page.getByRole('button', { name: '打开笔记' }).click()
  await secondTab.getByRole('button', { name: '打开笔记' }).click()
  const secondNotesPanel = secondTab.getByRole('dialog', { name: '笔记' })
  await expect(secondNotesPanel.getByLabel('笔记标题')).toHaveValue('Active note')
  await secondNotesPanel.getByRole('button', { name: '删除笔记' }).click()
  await secondTab.getByRole('alertdialog').getByRole('button', { name: '确认删除' }).click()

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.active-note.v1') ?? '""'))).toBe('note-first')
  await expect(page.getByRole('dialog', { name: '笔记' }).getByLabel('笔记标题')).toHaveValue('First note')
  await expect(page.getByRole('dialog', { name: '笔记' }).getByLabel('笔记内容')).toHaveValue('Keep this note')
  await secondTab.close()
})

test('simultaneous settings changes in separate tabs do not overwrite each other', async ({ page }) => {
  const secondTab = await page.context().newPage()
  await secondTab.goto('/')
  await Promise.all([
    page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
    secondTab.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
  ])

  await Promise.all([
    page.getByLabel('显示时间和日期').uncheck(),
    secondTab.getByLabel('显示待办概览小组件').check(),
  ])

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}')))
    .toMatchObject({ showClock: false, homeWidgetIds: ['todo-summary'] })
  await expect(page.locator('.home-clock')).toHaveCount(0)
  await expect(page.locator('.home-widget-shelf')).toBeVisible()
  await secondTab.close()
})

test('simultaneous list additions in separate tabs are both retained', async ({ page }) => {
  const secondTab = await page.context().newPage()
  await secondTab.goto('/')
  await Promise.all([
    page.getByRole('button', { name: '打开待办事项' }).click(),
    secondTab.getByRole('button', { name: '打开待办事项' }).click(),
  ])

  const firstPanel = page.getByRole('dialog', { name: '待办事项' })
  const secondPanel = secondTab.getByRole('dialog', { name: '待办事项' })
  await Promise.all([
    firstPanel.getByRole('textbox', { name: '添加一项待办' }).fill('From first tab'),
    secondPanel.getByRole('textbox', { name: '添加一项待办' }).fill('From second tab'),
  ])
  await Promise.all([
    firstPanel.getByRole('button', { name: '添加' }).click(),
    secondPanel.getByRole('button', { name: '添加' }).click(),
  ])

  await expect(firstPanel).toContainText('From first tab')
  await expect(firstPanel).toContainText('From second tab')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'From first tab' }),
      expect.objectContaining({ title: 'From second tab' }),
    ]))
  await secondTab.close()
})

test('simultaneous shortcut creations preserve launcher order and workspace membership', async ({ page }) => {
  const secondTab = await page.context().newPage()
  await secondTab.goto('/')
  await Promise.all([
    page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
    secondTab.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
  ])
  await Promise.all([
    page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: /添加快捷入口/ }).click(),
    secondTab.getByRole('dialog', { name: '设置' }).getByRole('button', { name: /添加快捷入口/ }).click(),
  ])

  const firstDialog = page.locator('.shortcut-dialog')
  const secondDialog = secondTab.locator('.shortcut-dialog')
  await Promise.all([
    firstDialog.getByPlaceholder('例如：GitHub').fill('First tab shortcut'),
    secondDialog.getByPlaceholder('例如：GitHub').fill('Second tab shortcut'),
  ])
  await Promise.all([
    firstDialog.getByPlaceholder('https://example.com').fill('https://first.example/'),
    secondDialog.getByPlaceholder('https://example.com').fill('https://second.example/'),
  ])
  await Promise.all([
    firstDialog.getByRole('button', { name: '保存' }).click(),
    secondDialog.getByRole('button', { name: '保存' }).click(),
  ])

  const shortcuts = () => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { id: string; title: string }[])
  await expect.poll(async () => (await shortcuts()).filter((item) => item.title.endsWith('tab shortcut')).map((item) => item.title).sort())
    .toEqual(['First tab shortcut', 'Second tab shortcut'])
  const readSyncState = () => page.evaluate(() => ({
    shortcuts: JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { id: string; title: string }[],
    order: JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[],
    workspaces: JSON.parse(localStorage.getItem('inftab.home-workspaces.v1') ?? '[]') as { id: string; itemIds: string[] }[],
  }))
  await expect.poll(async () => {
    const state = await readSyncState()
    const activeItems = state.workspaces.find((workspace) => workspace.id === 'default')?.itemIds ?? []
    return state.shortcuts.filter((item) => item.title.endsWith('tab shortcut'))
      .every((item) => state.order.includes(item.id) && activeItems.includes(item.id))
  }).toBe(true)
  const syncState = await readSyncState()
  const added = syncState.shortcuts.filter((item) => item.title.endsWith('tab shortcut'))
  const activeItems = syncState.workspaces.find((workspace) => workspace.id === 'default')?.itemIds ?? []
  const missingMemberships = added.flatMap((item) => {
    const missing = [
      ...(!syncState.order.includes(item.id) ? ['launcher order'] : []),
      ...(!activeItems.includes(item.id) ? ['active workspace'] : []),
    ]
    return missing.length ? [{ title: item.title, missing }] : []
  })
  expect(missingMemberships).toEqual([])

  await Promise.all([
    page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click(),
    secondTab.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click(),
  ])
  await secondTab.keyboard.press('Control+f')
  const search = secondTab.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await search.fill('First tab shortcut')
  await expect(secondTab.getByRole('option', { name: /First tab shortcut/ })).toBeVisible()
  await search.fill('Second tab shortcut')
  await expect(secondTab.getByRole('option', { name: /Second tab shortcut/ })).toBeVisible()
  await secondTab.reload()
  await secondTab.keyboard.press('Control+f')
  await secondTab.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Second tab shortcut')
  await expect(secondTab.getByRole('option', { name: /Second tab shortcut/ })).toBeVisible()
  await secondTab.close()
})

test('simultaneous widget selections in separate tabs are combined', async ({ page }) => {
  const secondTab = await page.context().newPage()
  await secondTab.goto('/')
  await Promise.all([
    page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
    secondTab.locator('.home-actions').getByRole('button', { name: '打开设置' }).click(),
  ])

  await Promise.all([
    page.getByLabel('显示待办概览小组件').check(),
    secondTab.getByLabel('显示倒计时小组件').check(),
  ])

  await expect.poll(() => page.evaluate(() => {
    const ids = JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetIds as string[]
    return ids?.slice().sort()
  })).toEqual(['countdown-summary', 'todo-summary'])
  await expect(page.locator('.home-widget-shelf')).toBeVisible()
  await secondTab.close()
})

test('simultaneous workspace creation in separate tabs preserves both workspaces', async ({ page, context }) => {
  const secondTab = await context.newPage()
  await secondTab.goto('/')
  await openWorkspaceMenu(page)
  await openWorkspaceMenu(secondTab)
  await Promise.all([
    page.getByRole('button', { name: '新建工作区' }).click(),
    secondTab.getByRole('button', { name: '新建工作区' }).click(),
  ])

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.home-workspaces.v1') ?? '[]')))
    .toHaveLength(3)
  await expect.poll(() => page.evaluate(() => new Set(
    (JSON.parse(localStorage.getItem('inftab.home-workspaces.v1') ?? '[]') as { name: string }[]).map((item) => item.name.toLocaleLowerCase()),
  ).size)).toBe(3)
  await expect(page.locator('.home-workspace-tab')).toHaveCount(3)
  await expect(secondTab.locator('.home-workspace-tab')).toHaveCount(3)
  await secondTab.close()
})

test('a concurrent shortcut stays visible when another tab deletes its workspace', async ({ page, context }) => {
  const secondTab = await context.newPage()
  await secondTab.goto('/')
  await openWorkspaceMenu(page)
  await page.getByRole('button', { name: '新建工作区' }).click()
  await expect(page.getByRole('button', { name: '工作区 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const storageKey = 'inftab.home-workspaces.v1'
  await expect.poll(() => page.evaluate((key) =>
    (JSON.parse(localStorage.getItem(key) ?? '[]') as { name: string }[]).some((item) => item.name === '工作区 1'), storageKey,
  )).toBe(true)
  const previous = await page.evaluate((key) => localStorage.getItem(key), storageKey)

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Concurrent link')
  await dialog.getByPlaceholder('https://example.com').fill('https://concurrent-workspace.example/')
  await dialog.getByRole('button', { name: '保存' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await expect.poll(() => page.evaluate((key) => {
    const workspaces = JSON.parse(localStorage.getItem(key) ?? '[]') as { name: string; itemIds: string[] }[]
    const shortcut = (JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { id: string; title: string }[])
      .find((item) => item.title === 'Concurrent link')
    return Boolean(shortcut && workspaces.find((item) => item.name === '工作区 1')?.itemIds.includes(shortcut.id))
  }, storageKey)).toBe(true)

  await page.evaluate(({ key, value }) => localStorage.setItem(key, value!), { key: storageKey, value: previous })
  await secondTab.reload()
  await openWorkspaceActions(secondTab, '工作区 1')
  await secondTab.getByRole('menuitem', { name: '删除' }).click()
  const confirmation = secondTab.getByRole('alertdialog', { name: '删除工作区？' })
  await confirmation.getByRole('button', { name: '确认删除' }).click()

  await expect(page.getByRole('button', { name: '主页', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Concurrent link')
  await expect(page.getByRole('option', { name: /Concurrent link/ })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => {
    const workspaces = JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string; itemIds: string[] }[]
    const shortcut = (JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { id: string; title: string }[])
      .find((item) => item.title === 'Concurrent link')
    return Boolean(shortcut && workspaces.find((item) => item.id === 'default')?.itemIds.includes(shortcut.id))
  }, storageKey)).toBe(true)
  await secondTab.close()
})

test('home widgets open their panel, reorder, and can be removed', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示待办概览小组件').check()
  await page.getByLabel('显示倒计时小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const widgetTitles = page.locator('.home-widget-title')
  await expect(widgetTitles).toHaveText(['待办概览', '倒计时'])
  await page.getByRole('button', { name: '将待办概览下移' }).click()
  await expect(widgetTitles).toHaveText(['倒计时', '待办概览'])
  await expect(page.locator('.home-widget-shelf .visually-hidden[role="status"]')).toHaveText('待办概览已移到第2个位置。')
  await page.locator('[data-widget-id="todo-summary"] .home-widget-grip')
    .dragTo(page.locator('[data-widget-id="countdown-summary"]'))
  await expect(widgetTitles).toHaveText(['待办概览', '倒计时'])
  await expect(page.locator('.home-widget-shelf .visually-hidden[role="status"]')).toHaveText('待办概览已移到第1个位置。')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetIds))
    .toEqual(['todo-summary', 'countdown-summary'])

  await page.reload()
  await expect(widgetTitles).toHaveText(['待办概览', '倒计时'])
  const activePageBeforeWidgetScroll = await page.locator('.page-dot[aria-current="page"]').getAttribute('aria-label')
  const widgetScrollPrevented = await page.locator('.home-widget-shelf').evaluate((element) => {
    const event = new WheelEvent('wheel', { deltaX: 80, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(widgetScrollPrevented).toBe(false)
  await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', activePageBeforeWidgetScroll ?? '')
  await page.getByRole('button', { name: '打开倒计时' }).click()
  await expect(page.getByRole('dialog', { name: '纪念日与倒计时' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '移除倒计时' }).click()
  await expect(page.locator('.home-widget-card')).toHaveCount(1)
})

test('enabled home widgets remain visible and scrollable in a short viewport', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示待办概览小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()
  await page.setViewportSize({ width: 390, height: 480 })

  const shelf = page.getByRole('region', { name: '首页小组件' })
  await expect(shelf).toBeVisible()
  const home = page.locator('.home')
  await expect(home).toHaveClass(/home-scrollable/)
  const activePage = await page.locator('.page-dot[aria-current="page"]').getAttribute('aria-label')
  await page.mouse.move(195, 400)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => home.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', activePage ?? '')
})

test('touch scrolling over shortcuts scrolls a short homepage without starting a drag', async ({ browser, page }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 480 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const touchPage = await context.newPage()
    await touchPage.addInitScript(() => {
      localStorage.setItem('inftab.preferences.v1', JSON.stringify({ homeWidgetIds: ['todo-summary'] }))
    })
    await touchPage.goto(new URL(page.url()).origin)
    const home = touchPage.locator('.home.home-scrollable')
    const shortcut = touchPage.locator('.shortcut-open').first()
    await expect(home).toBeVisible()
    await expect.poll(() => home.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    const bounds = await shortcut.boundingBox()
    if (!bounds) throw new Error('The first shortcut is not visible for the touch scroll check.')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    const cdp = await context.newCDPSession(touchPage)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 40, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 80, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await expect.poll(() => home.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(home.locator('.shortcut-cell.dragging')).toHaveCount(0)

    const source = touchPage.locator('.shortcut-cell[data-item-id="weather"] .shortcut-open')
    const target = touchPage.locator('.shortcut-cell[data-item-id="calendar"] .shortcut-open')
    await source.scrollIntoViewIfNeeded()
    const sourceBounds = await source.boundingBox()
    const targetBounds = await target.boundingBox()
    if (!sourceBounds || !targetBounds) throw new Error('The touch sorting targets are not visible.')
    const initialOrder = await touchPage.evaluate(() => JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[])
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: sourceBounds.x + sourceBounds.width / 2, y: sourceBounds.y + sourceBounds.height / 2, id: 2 }],
    })
    await touchPage.waitForTimeout(420)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: targetBounds.x + targetBounds.width / 2, y: targetBounds.y + targetBounds.height / 2, id: 2 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => touchPage.evaluate(() => JSON.parse(localStorage.getItem('inftab.launcher-order.v1') ?? '[]') as string[]))
      .not.toEqual(initialOrder)

    await cdp.detach()
  } finally {
    await context.close()
  }
})

test('touch gestures over the mobile widget shelf allow both page and shelf scrolling', async ({ browser, page }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 480 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const touchPage = await context.newPage()
    await touchPage.addInitScript(() => {
      localStorage.setItem('inftab.preferences.v1', JSON.stringify({
        homeWidgetIds: ['todo-summary', 'countdown-summary', 'notes-summary'],
      }))
    })
    await touchPage.goto(new URL(page.url()).origin)
    const home = touchPage.locator('.home.home-scrollable')
    const shelf = touchPage.locator('.home-widget-shelf')
    const firstCard = touchPage.locator('.home-widget-card').first()
    await expect(home).toBeVisible()
    await expect(shelf).toBeVisible()
    await expect.poll(() => home.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await expect.poll(() => shelf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)

    const cdp = await context.newCDPSession(touchPage)
    const bounds = await firstCard.boundingBox()
    if (!bounds) throw new Error('The first home widget is not visible for the touch scroll check.')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 90, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => home.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    const nextX = x - 100
    const shelfY = (await firstCard.boundingBox())?.y ?? y
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: shelfY + 25, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 45, y: shelfY + 25, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nextX, y: shelfY + 25, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => shelf.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await cdp.detach()
  } finally {
    await context.close()
  }
})

test('touch gestures over the mobile dock allow both page and dock scrolling', async ({ browser, page }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 480 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const touchPage = await context.newPage()
    await touchPage.addInitScript(() => {
      localStorage.setItem('inftab.preferences.v1', JSON.stringify({
        homeWidgetIds: ['todo-summary', 'habits-summary', 'countdown-summary', 'notes-summary', 'calendar-summary'],
        dockItemIds: ['jd', 'tmall', 'taobao', 'vip', 'gaoding', 'baidu', 'lunwenmao', 'ctrip'],
      }))
    })
    await touchPage.goto(new URL(page.url()).origin)
    const home = touchPage.locator('.home.home-scrollable')
    const dock = touchPage.locator('.home-dock')
    const dockItem = touchPage.locator('.home-dock-item').first()
    await expect(home).toBeVisible()
    await expect(dock).toBeVisible()
    await expect.poll(() => home.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await expect.poll(() => dock.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    const cdp = await context.newCDPSession(touchPage)
    const bounds = await dockItem.boundingBox()
    if (!bounds) throw new Error('The first Dock item is not visible for the touch scroll check.')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 90, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => home.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const nextX = x - 100
    const dockY = (await dockItem.boundingBox())?.y ?? y
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: dockY + 10, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 45, y: dockY + 10, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nextX, y: dockY + 10, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => dock.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await cdp.detach()
  } finally {
    await context.close()
  }
})

test('calendar home widget can be enabled and opens the interactive calendar panel', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示月历小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const calendarWidget = page.locator('[data-widget-id="calendar-summary"]')
  await expect(calendarWidget).toBeVisible()
  await expect(calendarWidget.locator('.home-widget-calendar-day')).toHaveCount(42)
  await expect(calendarWidget.locator('[aria-current="date"]')).toBeVisible()

  await calendarWidget.getByRole('button', { name: '打开月历' }).click()
  const calendarPanel = page.getByRole('dialog', { name: '日历' })
  await expect(calendarPanel).toBeVisible()
  const monthBefore = await calendarPanel.locator('.calendar-month-nav h3').textContent()
  await calendarPanel.getByRole('button', { name: '下个月' }).click()
  await expect(calendarPanel.locator('.calendar-month-nav h3')).not.toHaveText(monthBefore ?? '')
})

test('weather home widget shows the current city reading and opens its panel', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settingsPanel = page.getByRole('dialog', { name: '设置' })
  await settingsPanel.getByLabel('显示天气小组件').check()
  await settingsPanel.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="weather-summary"]')
  await expect(widget).toContainText('上海 20°')
  await expect(widget).toContainText('大致晴朗')
  await widget.getByRole('button', { name: '打开天气' }).click()
  await expect(page.getByRole('dialog', { name: '天气' })).toBeVisible()
})

test('weather panel can search for another city after its initial forecast loads', async ({ page }) => {
  let geocodingAttempts = 0
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    geocodingAttempts += 1
    const city = geocodingAttempts === 1
      ? { id: 1, name: '上海', admin1: '上海', country: '中国', latitude: 31.2, longitude: 121.5 }
      : { id: 2, name: '北京', admin1: '北京', country: '中国', latitude: 39.9, longitude: 116.4 }
    await route.fulfill({ json: { results: [city] } })
  })
  await page.getByRole('button', { name: '打开天气' }).click()
  const panel = page.getByRole('dialog', { name: '天气' })
  await expect(panel.locator('.weather-place h3')).toHaveText('上海')
  await panel.getByRole('textbox', { name: '搜索城市天气' }).fill('北京')
  await panel.getByRole('button', { name: '搜索城市' }).click()
  await expect(panel.locator('.weather-place h3')).toHaveText('北京')
})

test('weather widget keeps its source and the homepage usable while offline, then recovers on retry', async ({ page }) => {
  let geocodingAttempts = 0
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    geocodingAttempts += 1
    if (geocodingAttempts === 1) {
      await route.fulfill({ status: 503, body: 'offline' })
      return
    }
    await route.fulfill({ json: { results: [{ id: 1, name: '上海', admin1: '上海', country: '中国', latitude: 31.2, longitude: 121.5 }] } })
  })
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({
    json: { current: { temperature_2m: 20, weather_code: 1 } },
  }))
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settingsPanel = page.getByRole('dialog', { name: '设置' })
  await settingsPanel.getByLabel('显示天气小组件').check()
  await settingsPanel.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="weather-summary"]')
  await expect(widget.getByRole('status')).toContainText('天气服务暂时不可用')
  await expect(widget.getByRole('link', { name: '天气数据由 Open-Meteo 提供' })).toHaveAttribute('href', 'https://open-meteo.com/')
  await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: '输入并搜索' })).toBeVisible()

  await widget.getByRole('button', { name: '重试获取天气' }).click()
  await expect(widget).toContainText('上海 20°')
  await expect(widget.getByRole('link', { name: '天气数据由 Open-Meteo 提供' })).toBeVisible()
})

test('focus timer widget stays in sync with the panel and survives a reload', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settingsPanel = page.getByRole('dialog', { name: '设置' })
  await settingsPanel.getByLabel('显示专注计时小组件').check()
  await settingsPanel.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="focus-timer-summary"]')
  await expect(widget).toContainText('专注时间')
  await expect(widget.locator('[role="timer"]')).toHaveText('25:00')
  await widget.getByRole('button', { name: '打开专注计时' }).click()
  const panel = page.getByRole('dialog', { name: '专注计时' })
  await panel.getByLabel('专注时长').selectOption('50')
  await panel.getByRole('button', { name: '开始计时' }).click()
  await expect(panel.locator('[role="timer"]')).toHaveText('50:00')
  await panel.getByRole('button', { name: '关闭' }).click()
  await expect(widget.locator('[role="timer"]')).toHaveText('50:00')

  await page.reload()
  const restoredWidget = page.locator('[data-widget-id="focus-timer-summary"]')
  await expect(restoredWidget.locator('[role="timer"]')).toHaveText(/49:5[0-9]/)
  await restoredWidget.getByRole('button', { name: '打开专注计时' }).click()
  const restoredPanel = page.getByRole('dialog', { name: '专注计时' })
  await expect(restoredPanel.locator('[role="timer"]')).toHaveText(/49:5[0-9]/)
})

test('bookmark widget keeps its extension permission boundary on the website', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settingsPanel = page.getByRole('dialog', { name: '设置' })
  await settingsPanel.getByLabel('显示书签概览小组件').check()
  await settingsPanel.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="bookmarks-summary"]')
  await expect(widget).toContainText('此功能需要浏览器扩展')
  await widget.getByRole('button', { name: '打开书签概览' }).click()
  await expect(page.getByRole('dialog', { name: '浏览器书签' })).toContainText('请在已安装的 Chrome 或 Edge 新标签页中查看浏览器书签')
})

test('history widget keeps its extension permission boundary on the website', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settingsPanel = page.getByRole('dialog', { name: '设置' })
  await settingsPanel.getByLabel('显示最近访问小组件').check()
  await settingsPanel.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="history-summary"]')
  await expect(widget).toContainText('此功能需要浏览器扩展')
  await widget.getByRole('button', { name: '打开最近访问' }).click()
  await expect(page.getByRole('dialog', { name: '浏览历史' })).toContainText('请在已安装的 Chrome 或 Edge 新标签页中查看浏览历史')
})

test('countdowns can be created, edited, deleted, and persist across reloads', async ({ page }) => {
  await page.getByRole('button', { name: '打开纪念日' }).click()
  const panel = page.getByRole('dialog', { name: '纪念日与倒计时' })
  await expect(panel).toBeVisible()

  await panel.getByLabel('纪念日名称').fill('出行纪念日')
  await panel.getByLabel('纪念日日期').fill('2030-04-05')
  await panel.getByLabel('重复频率').selectOption('yearly')
  await panel.getByRole('button', { name: '添加纪念日' }).click()
  await expect(panel.getByText('出行纪念日')).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.countdowns.v1') ?? '[]')))
    .toMatchObject([{ title: '出行纪念日', date: '2030-04-05', recurrence: 'yearly' }])

  await panel.getByRole('button', { name: '编辑出行纪念日' }).click()
  await panel.getByLabel('纪念日名称').fill('春季旅行')
  await panel.getByLabel('纪念日日期').fill('2030-05-06')
  await panel.getByRole('button', { name: '保存修改' }).click()
  await expect(panel.getByText('春季旅行')).toBeVisible()

  await page.reload()
  const reloadedPanel = page.getByRole('dialog', { name: '纪念日与倒计时' })
  await page.getByRole('button', { name: '打开纪念日' }).click()
  await expect(reloadedPanel.getByText('春季旅行')).toBeVisible()
  await reloadedPanel.getByRole('button', { name: '删除春季旅行' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除' }).click()
  await expect(reloadedPanel.getByText('春季旅行')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.countdowns.v1') ?? '[]'))).toEqual([])
})

test('notes widget previews the selected note and opens the notes panel', async ({ page }) => {
  await page.getByRole('button', { name: '打开笔记' }).click()
  const notesPanel = page.getByRole('dialog', { name: '笔记' })
  await notesPanel.getByRole('button', { name: '新建笔记' }).click()
  await notesPanel.getByLabel('笔记标题').fill('发布检查')
  await notesPanel.getByLabel('笔记内容').fill('确认打包、回归和发布记录。')
  await notesPanel.getByRole('button', { name: '关闭' }).click()

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示便签小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const widget = page.locator('[data-widget-id="notes-summary"]')
  await expect(widget).toContainText('发布检查')
  await expect(widget).toContainText('确认打包、回归和发布记录。')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetIds))
    .toEqual(['notes-summary'])
  await page.reload()
  await expect(page.locator('[data-widget-id="notes-summary"]')).toContainText('发布检查')
  await widget.getByRole('button', { name: '打开便签' }).click()
  await expect(page.getByRole('dialog', { name: '笔记' }).getByLabel('笔记内容')).toHaveValue('确认打包、回归和发布记录。')
})

test('desktop widget shelf fits every enabled widget into a responsive grid', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示待办概览小组件').check()
  await page.getByLabel('显示倒计时小组件').check()
  await page.getByLabel('显示便签小组件').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const shelf = page.getByRole('region', { name: '首页小组件' })
  const cards = shelf.locator('.home-widget-card')
  await expect(cards).toHaveCount(3)
  const wideLayoutRows = await cards.evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().y))).size)
  expect(wideLayoutRows).toBe(1)
  await page.getByRole('button', { name: '将待办概览加宽' }).click()
  await expect(page.locator('[data-widget-id="todo-summary"]')).toHaveClass(/home-widget-card-wide/)
  const expandedLayoutRows = await cards.evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().y))).size)
  expect(expandedLayoutRows).toBe(2)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetSizes?.['todo-summary']))
    .toBe('wide')
  await page.getByRole('button', { name: '将待办概览扩展为整行' }).click()
  await expect(page.locator('[data-widget-id="todo-summary"]')).toHaveClass(/home-widget-card-full/)
  const fullWidth = await page.locator('[data-widget-id="todo-summary"]').evaluate((element) => ({
    card: element.getBoundingClientRect().width,
    shelf: element.parentElement!.getBoundingClientRect().width,
  }))
  expect(Math.abs(fullWidth.card - fullWidth.shelf)).toBeLessThan(2)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetSizes?.['todo-summary']))
    .toBe('full')
  await page.reload()
  await expect(page.locator('[data-widget-id="todo-summary"]')).toHaveClass(/home-widget-card-full/)
  await page.setViewportSize({ width: 800, height: 900 })
  const compactLayout = await shelf.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(compactLayout.columns).toBe(2)
  expect(compactLayout.scrollWidth).toBeLessThanOrEqual(compactLayout.clientWidth)
  expect(await cards.evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().y))).size)).toBe(2)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator('[data-widget-id="todo-summary"]').evaluate((element) => getComputedStyle(element).gridColumn)).toBe('auto')
})

test('applying a widget preset persists its order and keeps size and dock settings', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'inftab.preferences.v1'
    const preferences = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    const homeWidgetSizes = preferences.homeWidgetSizes as Record<string, string> | undefined
    localStorage.setItem(key, JSON.stringify({
      ...preferences,
      homeWidgetIds: ['calendar-summary'],
      homeWidgetSizes: { ...homeWidgetSizes, 'todo-summary': 'wide', 'calendar-summary': 'full' },
      dockItemIds: ['calendar'],
    }))
  })
  await page.reload()
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.getByRole('button', { name: '应用日常效率组件方案' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').homeWidgetIds))
    .toEqual(['todo-summary', 'habits-summary', 'focus-timer-summary', 'countdown-summary', 'notes-summary'])
  await settings.getByRole('button', { name: '关闭' }).click()

  await expect(page.locator('.home-widget-card')).toHaveCount(5)
  await expect(page.locator('.home-widget-card').first()).toHaveAttribute('data-widget-id', 'todo-summary')
  const savedPreferences = await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}'))
  expect(savedPreferences.homeWidgetSizes['todo-summary']).toBe('wide')
  expect(savedPreferences.homeWidgetSizes['calendar-summary']).toBe('full')
  expect(savedPreferences.dockItemIds).toEqual(['calendar'])

  await page.reload()
  await expect(page.locator('.home-widget-card')).toHaveCount(5)
  await expect(page.locator('.home-widget-card').first()).toHaveAttribute('data-widget-id', 'todo-summary')
})

test('lazy folder editor creates and opens a folder with selected shortcuts', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '新建文件夹' }).click()
  const editor = page.getByRole('dialog', { name: '新建文件夹' })
  await editor.getByLabel('文件夹名称').fill('工作')
  await editor.getByRole('checkbox', { name: /京东商城/ }).check()
  await editor.getByRole('checkbox', { name: /天猫精选/ }).check()
  await editor.getByRole('button', { name: '保存文件夹' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('button', { name: '打开工作' }).click()
  const folder = page.getByRole('dialog', { name: '工作' })
  await expect(folder).toContainText('京东商城')
  await expect(folder).toContainText('天猫精选')
})

test('opening every shortcut in a folder creates a new browser tab for each site', async ({ page }) => {
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

test('keyboard launcher search finds and opens a shortcut stored inside a folder', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '新建文件夹' }).click()
  const editor = page.getByRole('dialog', { name: '新建文件夹' })
  await editor.getByLabel('文件夹名称').fill('工作')
  await editor.getByRole('checkbox', { name: /京东商城/ }).check()
  await editor.getByRole('button', { name: '保存文件夹' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  await page.evaluate(() => {
    Object.defineProperty(window, '__openedShortcutUrls', { configurable: true, value: [] as string[] })
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: (url: string) => {
        (window as Window & { __openedShortcutUrls: string[] }).__openedShortcutUrls.push(url)
        return null
      },
    })
  })
  await page.keyboard.press('Control+f')
  const search = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await search.fill('jd.com')
  const result = page.getByRole('option', { name: /工作 · 京东商城/ })
  await expect(result).toBeVisible()
  await result.click()

  await expect.poll(() => page.evaluate(() => (window as Window & { __openedShortcutUrls: string[] }).__openedShortcutUrls))
    .toEqual(['https://www.jd.com/'])
})

test('pinned dock launchers stay available across pages and reloads', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('固定天气到 Dock').check()
  await page.getByLabel('固定待办事项到 Dock').check()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  const dock = page.getByRole('navigation', { name: '常驻 Dock' })
  await expect(dock.getByRole('button', { name: '打开天气' })).toBeVisible()
  await expect(dock.getByRole('button', { name: '打开待办事项' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').dockItemIds))
    .toEqual(['weather', 'todos'])

  await page.getByRole('button', { name: '下一页' }).click()
  await dock.getByRole('button', { name: '打开待办事项' }).click()
  await expect(page.getByRole('dialog', { name: '待办事项' })).toBeVisible()
  await page.getByRole('dialog', { name: '待办事项' }).getByRole('button', { name: '关闭' }).click()

  await page.reload()
  await page.getByRole('button', { name: '下一页' }).click()
  const restoredDock = page.getByRole('navigation', { name: '常驻 Dock' })
  await expect(restoredDock.getByRole('button', { name: '打开待办事项' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 480 })
  await expect(page.locator('.home')).toHaveClass(/home-scrollable/)
  await expect(restoredDock).toBeVisible()
  await restoredDock.getByRole('button', { name: '打开待办事项' }).click()
  await expect(page.getByRole('dialog', { name: '待办事项' })).toBeVisible()
})

test('pins a custom shortcut from its context menu and restores it after reload', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: /添加快捷入口/ }).click()
  const dialog = page.locator('.shortcut-dialog')
  await dialog.getByPlaceholder('例如：GitHub').fill('Dock Example')
  await dialog.getByPlaceholder('https://example.com').fill('https://example.org/dock')
  await dialog.getByRole('button', { name: '保存' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  const shortcut = page.locator('.shortcut-cell').filter({ has: page.getByRole('button', { name: '打开Dock Example' }) })
  if (!(await shortcut.isVisible())) await page.getByRole('button', { name: '下一页' }).click()
  await shortcut.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '固定到 Dock' }).click()

  const dock = page.getByRole('navigation', { name: '常驻 Dock' })
  await expect(dock.getByRole('button', { name: '打开Dock Example' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').dockItemIds))
    .toEqual([await shortcut.getAttribute('data-item-id')])

  await page.reload()
  await expect(page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开Dock Example' })).toBeVisible()

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '新建文件夹' }).click()
  const folderEditor = page.getByRole('dialog', { name: '新建文件夹' })
  await folderEditor.getByLabel('文件夹名称').fill('Dock 文件夹')
  await folderEditor.getByRole('checkbox', { name: /Dock Example/ }).check()
  await folderEditor.getByRole('button', { name: '保存文件夹' }).click()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  const shortcutId = await page.evaluate(() => (JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]') as { id: string; title: string }[])
    .find((shortcut) => shortcut.title === 'Dock Example')?.id)
  expect(shortcutId).toBeTruthy()
  await expect(page.locator(`.shortcut-cell[data-item-id="${shortcutId}"]`)).toHaveCount(0)
  await dock.getByRole('button', { name: '打开Dock Example' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '从 Dock 移除Dock Example' }).click()
  await expect(dock).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').dockItemIds))
    .toEqual([])
})

test('drags a launcher into the dock and places it before the drop target', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('固定天气到 Dock').check()
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

  const dock = page.getByRole('navigation', { name: '常驻 Dock' })
  const target = dock.getByRole('button', { name: '打开天气' })
  const shortcut = page.locator('.shortcut-page[aria-hidden="false"] [data-item-id="jd"] .shortcut-open')
  await shortcut.dragTo(target)

  await expect(dock.getByRole('button', { name: '打开京东商城' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').dockItemIds))
    .toEqual(['jd', 'weather'])
})

test('dock icons omit labels and use a context menu for removal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const shortcut = page.locator('.shortcut-cell[data-item-id="jd"]')
  if (!(await shortcut.isVisible())) await page.getByRole('button', { name: '下一页' }).click()
  await shortcut.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '固定到 Dock' }).click()

  const dock = page.getByRole('navigation', { name: '常驻 Dock' })
  const item = dock.getByRole('button', { name: '打开京东商城' })
  await expect(item).toBeVisible()
  await expect(dock.locator('.home-dock-label, .home-dock-remove')).toHaveCount(0)
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const magnification = page.getByLabel('Dock 图标放大效果')
  await expect(magnification).not.toBeChecked()
  await magnification.check()
  await expect(magnification).toBeChecked()
  await magnification.uncheck()
  const followLauncherSize = page.getByLabel('Dock 图标跟随首页大小')
  await expect(followLauncherSize).toBeChecked()
  await followLauncherSize.uncheck()
  const iconSize = page.getByLabel(/Dock 图标大小/)
  await expect(iconSize).toBeEnabled()
  await iconSize.focus()
  await iconSize.press('ArrowRight')
  await expect(iconSize).toHaveValue('46')
  const iconGap = page.getByLabel(/Dock 图标间距/)
  await iconGap.focus()
  await iconGap.press('ArrowRight')
  await expect(iconGap).toHaveValue('4')
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
  await expect(dock).toHaveClass(/magnification-off/)
  await expect(dock).toHaveAttribute('style', /--dock-size-setting:\s*46px/)
  await expect(dock).toHaveAttribute('style', /--dock-gap-setting:\s*4px/)
  const responsiveIcon = await item.locator('.home-dock-icon').boundingBox()
  expect(responsiveIcon?.width).toBeCloseTo(40, 0)
  await item.hover()
  await expect.poll(() => item.locator('.home-dock-icon').evaluate((icon) => getComputedStyle(icon).filter)).toContain('drop-shadow')
  await item.click({ button: 'right' })
  const remove = page.getByRole('menuitem', { name: '从 Dock 移除京东商城' })
  await expect(remove).toBeVisible()
  await remove.click()
  await expect(dock).toHaveCount(0)
})
