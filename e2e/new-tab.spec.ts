import { readFile } from 'node:fs/promises'
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

test('quick translation sends an encoded query to the external translator', async ({ page }) => {
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

test('quick translation reports an exhausted chunk load without an unhandled page error', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/assets/translation-*.js', (route) => route.fulfill({ status: 503, body: 'offline' }))
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('hello')
  await page.getByRole('button', { name: '翻译成简体中文' }).click()
  await expect(page.getByRole('status').filter({ hasText: '翻译工具暂时无法加载' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

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

  await page.getByRole('button', { name: '主页', exact: true }).click()
  await expect(dock).toHaveCount(0)
  await localSearch.fill('Workspace only')
  await expect(page.locator('.local-search-empty')).toContainText('没有匹配的快捷入口')

  await page.getByRole('button', { name: '工作区 1', exact: true }).click()
  await expect(dock.getByRole('button', { name: '打开Workspace only' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '工作区 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+f')
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Workspace only')
  await expect(page.getByRole('option', { name: /Workspace only/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开Workspace only' })).toBeVisible()

  await page.getByRole('button', { name: '重命名当前工作区' }).click()
  const workspaceName = page.getByRole('textbox', { name: '工作区名称' })
  await workspaceName.fill('娱乐')
  await workspaceName.press('Enter')
  await expect(page.getByRole('button', { name: '娱乐', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '删除当前工作区' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '删除工作区？' })
  await expect(confirmation).toContainText('会移回“主页”')
  await confirmation.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('button', { name: '主页', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('option', { name: /Workspace only/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开Workspace only' })).toBeVisible()
})

test('workspace tabs can be reordered without moving the homepage and persist their order', async ({ page }) => {
  await page.getByRole('button', { name: '新建工作区' }).click()
  await page.getByRole('button', { name: '新建工作区' }).click()
  await expect(page.locator('.home-workspace-tab')).toHaveText(['主页', '工作区 1', '工作区 2'])

  await page.getByRole('button', { name: '将工作区 2左移' }).click()

  await expect(page.locator('.home-workspace-tab')).toHaveText(['主页', '工作区 2', '工作区 1'])
  await expect(page.getByRole('button', { name: '工作区 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '将工作区 2左移' })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.home-workspace-tab')).toHaveText(['主页', '工作区 2', '工作区 1'])
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
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '导出 JSON 备份' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).not.toBeNull()
  const backup = JSON.parse(await readFile(path!, 'utf8')) as { todos: { title: string }[] }
  expect(backup.todos).toContainEqual(expect.objectContaining({ title: 'Recover this unsaved note' }))
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
    const firstFocusable = panel.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])').first()
    const lastFocusable = panel.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])').last()
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
    await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).contentVisibility)).toBe('auto')
    await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).containIntrinsicSize)).toContain(expectedSize)
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

test('retries a transient homepage widget chunk failure', async ({ page }) => {
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

test('reduced-motion preference skips page effects and long transitions', async ({ page }) => {
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
  await expect(page.locator('#shortcut-particle-canvas')).toHaveCount(0)
  await expect(page.locator('.particles-in, .particles-out, .trails-out')).toHaveCount(0)
  const transitionDurationMs = await track.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration) * 1000)
  expect(transitionDurationMs).toBeLessThanOrEqual(0.02)
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
  await page.reload()
  await expect(page.locator('[data-widget-id="todo-summary"]')).toHaveClass(/home-widget-card-wide/)
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
  await dock.getByRole('button', { name: '打开Dock Example' }).hover()
  await dock.getByRole('button', { name: '从 Dock 移除Dock Example' }).click()
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

test('dock removal remains visible and tappable on touch screens', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  try {
    const touchPage = await context.newPage()
    await touchPage.goto('/')
    await touchPage.evaluate(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: ['jd'] })))
    await touchPage.reload()

    const dock = touchPage.getByRole('navigation', { name: '常驻 Dock' })
    const remove = dock.getByRole('button', { name: '从 Dock 移除京东商城' })
    await expect(remove).toBeVisible()
    const targetSize = await remove.boundingBox()
    expect(targetSize?.width).toBeGreaterThanOrEqual(24)
    expect(targetSize?.height).toBeGreaterThanOrEqual(24)
    await remove.tap()
    await expect(dock).toHaveCount(0)
  } finally {
    await context.close()
  }
})
