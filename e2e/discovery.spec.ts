import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  errors.set(page, [])
  page.on('pageerror', (error) => errors.get(page)!.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]) })

async function seed(page: Page, data: Record<string, unknown>) {
  await page.evaluate((records) => {
    window.dispatchEvent(new Event('pagehide'))
    for (const [key, value] of Object.entries(records)) localStorage.setItem(key, JSON.stringify(value))
  }, data)
  await page.reload()
}

async function startSearch(page: Page, query = '') {
  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await expect(page.getByRole('group', { name: '查找范围' })).toBeVisible()
  const input = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await input.fill(query)
  return input
}

const remoteLink = { id: 'remote-link', title: 'Remote target', url: 'https://remote.example/landing', color: '#467d68', mark: 'R' }
const remoteFolder = { id: 'remote-folder', title: 'Team links', shortcutIds: [remoteLink.id], color: '#467d68', mark: 'T' }
const workspaces = [
  { id: 'default', name: '主页', itemIds: [] },
  { id: 'work', name: '工作', itemIds: [remoteLink.id, remoteFolder.id] },
]
const workspaceData = {
  'inftab.shortcuts.v1': [remoteLink], 'inftab.folders.v1': [remoteFolder],
  'inftab.home-workspaces.v1': workspaces, 'inftab.active-home-workspace.v1': 'default',
}

test('global discovery shows real locations and switches workspace only when a result is opened', async ({ page, context }) => {
  await seed(page, workspaceData)
  const homeUrl = page.url()
  const outgoing: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(homeUrl).origin) outgoing.push(request.url()) })
  await startSearch(page, 'Remote target')
  await expect(page.getByText('没有匹配的快捷入口', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '全部工作区', exact: true }).click()
  const result = page.getByRole('option', { name: '工作 · Team links · Remote target', exact: true })
  await expect(result).toBeVisible()
  await expect(result).toContainText('工作 / Team links')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.active-home-workspace.v1')!))).toBe('default')
  expect(outgoing).toEqual([])
  await context.route('https://remote.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Remote target</title>' }))
  const opened = context.waitForEvent('page')
  await result.click()
  const target = await opened
  await expect(target).toHaveURL(remoteLink.url)
  expect(page.url()).toBe(homeUrl)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.active-home-workspace.v1')!))).toBe('work')
  await target.close()
  await page.reload()
  await startSearch(page, 'Remote target')
  await expect(page.getByRole('button', { name: '当前工作区', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('option', { name: 'Team links · Remote target', exact: true })).toBeVisible()
})

test('a foreign folder opens its contents in the correct workspace and returns focus safely', async ({ page }) => {
  await seed(page, workspaceData)
  await startSearch(page, 'Team links')
  await page.getByRole('button', { name: '全部工作区', exact: true }).click()
  await page.getByRole('option', { name: '工作 · Team links', exact: true }).click()
  const folder = page.getByRole('dialog', { name: 'Team links', exact: true })
  await expect(folder.getByRole('button', { name: 'Remote target', exact: true })).toBeVisible()
  await folder.getByRole('button', { name: '关闭文件夹', exact: true }).click()
  await expect(page.getByRole('button', { name: '查找快捷入口', exact: true })).toBeFocused()
})

test('relevance, full-width input and multi-word matching work without leaving local search', async ({ page }) => {
  const items = [
    { id: 'url', title: 'Reference', url: 'https://vue.example/' },
    { id: 'words', title: 'Learn Vue', url: 'https://words.example/' },
    { id: 'prefix', title: 'Vue Docs', url: 'https://prefix.example/' },
    { id: 'exact', title: 'Vue', url: 'https://exact.example/' },
  ].map((item) => ({ ...item, color: '#467d68', mark: 'V' }))
  await seed(page, { 'inftab.shortcuts.v1': items })
  const input = await startSearch(page, 'ＶＵＥ')
  await expect(page.getByRole('option').first()).toHaveAccessibleName('Vue')
  await input.fill('  docs   vue  ')
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(page.getByRole('option')).toHaveAccessibleName('Vue Docs')
  await input.press('ArrowDown')
  await expect(page.getByRole('option')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(input).toBeFocused()
  await input.fill('never-match-this')
  await input.press('Enter')
  await expect(page.getByText('没有匹配的快捷入口', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const themeMode of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 760 }, { width: 390, height: 360 }]) {
    test(`search stays in view and scrolls independently: ${themeMode}, ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const items = Array.from({ length: 30 }, (_, index) => ({ id: `record-${index}`, title: `Example ${index}`, url: `https://example-${index}.test/`, color: '#467d68', mark: 'E' }))
      await seed(page, { 'inftab.preferences.v1': { themeMode }, 'inftab.shortcuts.v1': items })
      await startSearch(page, 'Example')
      const popup = page.locator('.launcher-search')
      const bounds = await popup.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      await expect(page.getByRole('option')).toHaveCount(12)
      const list = page.getByRole('listbox', { name: '快捷入口搜索结果', exact: true })
      await list.hover()
      await page.mouse.wheel(0, 400)
      await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', '第1页')
      await expect(page.getByRole('group', { name: '查找范围' })).toBeVisible()
      await expect(page.locator('#launcher-search-help')).toBeVisible()
      await page.getByRole('button', { name: '显示更多（还有 18 项）', exact: true }).click()
      await expect(page.getByRole('option')).toHaveCount(24)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    })
  }
}

for (const folder of [false, true]) {
  test(`search empty-state actions create ${folder ? 'a folder' : 'a shortcut'} and restore the hidden search preference`, async ({ page }) => {
    await seed(page, { 'inftab.preferences.v1': { showSearchBar: false } })
    await startSearch(page)
    await page.locator('.launcher-search-actions').getByRole('button', { name: folder ? '创建文件夹' : '添加快捷入口', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: folder ? '新建文件夹' : '添加快捷入口', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: folder ? '关闭文件夹' : '关闭', exact: true }).click()
    await expect(page.getByRole('button', { name: '查找快捷入口', exact: true })).toBeFocused()
    await expect(page.locator('.search-area')).toHaveCount(0)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1')!).showSearchBar)).toBe(false)
  })
}

test('homepage quick tasks add, complete, undo, persist, and remain in sync with the panel', async ({ page }) => {
  await seed(page, {
    'inftab.preferences.v1': { homeWidgetIds: ['todo-summary'] },
    'inftab.todos.v1': [{ id: 'original', title: 'Review spec', done: false }],
  })
  const widget = page.locator('[data-widget-id="todo-summary"]')
  const input = widget.getByRole('textbox', { name: '快速添加待办', exact: true })
  await input.fill('Plan tomorrow')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(widget).toContainText('还有 2 项待完成')
  await widget.getByRole('checkbox', { name: '完成待办：Plan tomorrow', exact: true }).click()
  await expect(widget).toContainText('还有 1 项待完成')
  await expect(widget.getByRole('checkbox', { name: '完成待办：Review spec', exact: true })).toBeFocused()
  await widget.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(widget.getByRole('checkbox', { name: '完成待办：Plan tomorrow', exact: true })).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(widget).toContainText('还有 2 项待完成')
  await widget.getByRole('button', { name: '打开待办概览', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '待办事项', exact: true })
  await expect(panel).toContainText('Plan tomorrow')
  await panel.locator('.todo-list li').filter({ hasText: 'Plan tomorrow' }).getByRole('button', { name: '标记为完成', exact: true }).click()
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(widget).toContainText('还有 1 项待完成')
})

test('quick tasks synchronize across open tabs without replacing unrelated additions', async ({ page, context }) => {
  await seed(page, {
    'inftab.preferences.v1': { homeWidgetIds: ['todo-summary'] },
    'inftab.todos.v1': [{ id: 'shared', title: 'Shared task', done: false }],
  })
  const other = await context.newPage()
  try {
    await other.goto('/')
    const widget = page.locator('[data-widget-id="todo-summary"]')
    const otherWidget = other.locator('[data-widget-id="todo-summary"]')
    await expect(otherWidget.getByRole('checkbox', { name: '完成待办：Shared task', exact: true })).toBeVisible()
    await widget.getByRole('checkbox', { name: '完成待办：Shared task', exact: true }).click()
    await expect(otherWidget).toContainText('今天的待办都完成了')
    const input = otherWidget.getByRole('textbox', { name: '快速添加待办', exact: true })
    await input.fill('Added in another tab')
    await input.press('Enter')
    await expect(widget.getByRole('checkbox', { name: '完成待办：Added in another tab', exact: true })).toBeVisible()
    await widget.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(otherWidget).toContainText('还有 2 项待完成')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.todos.v1')!))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shared', done: false }), expect.objectContaining({ title: 'Added in another tab', done: false }),
    ]))
  } finally { await other.close() }
})

test('IME confirmation does not submit local search or quick tasks, while the next Enter still works', async ({ page }) => {
  await seed(page, { 'inftab.preferences.v1': { homeWidgetIds: ['todo-summary'] } })
  const input = await startSearch(page, '计算器')
  await expect(page.getByRole('option', { name: '计算器', exact: true })).toBeVisible()
  await input.dispatchEvent('compositionstart')
  await input.press('ArrowDown')
  await expect(input).toBeFocused()
  await input.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await input.dispatchEvent('compositionend')
  await input.press('Enter')
  const panel = page.getByRole('dialog', { name: '计算器', exact: true })
  await expect(panel.locator('.calculator-content')).toBeVisible()
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  const widget = page.locator('[data-widget-id="todo-summary"]')
  const draft = widget.getByRole('textbox', { name: '快速添加待办', exact: true })
  await draft.fill('输入法确认后再添加')
  await draft.dispatchEvent('compositionstart')
  await draft.press('Enter')
  await expect(widget.getByRole('checkbox')).toHaveCount(0)
  await expect(draft).toHaveValue('输入法确认后再添加')
  await draft.dispatchEvent('compositionend')
  await draft.press('Enter')
  await expect(widget.getByRole('checkbox', { name: '完成待办：输入法确认后再添加', exact: true })).toBeVisible()
})

for (const action of ['ctrl', 'meta', 'shift', 'middle'] as const) {
  test(`cross-workspace search keeps ${action} opening overrides when same-tab is preferred`, async ({ page, context }) => {
    await seed(page, { ...workspaceData, 'inftab.preferences.v1': { openShortcutsInNewTab: false } })
    const homeUrl = page.url()
    await context.route('https://remote.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Remote target</title>' }))
    await startSearch(page, 'Remote target')
    await page.getByRole('button', { name: '全部工作区', exact: true }).click()
    const result = page.getByRole('option', { name: '工作 · Team links · Remote target', exact: true })
    const opened = context.waitForEvent('page')
    await result.click(action === 'middle' ? { button: 'middle' } : { modifiers: [action === 'ctrl' ? 'Control' : action === 'meta' ? 'Meta' : 'Shift'] })
    const target = await opened
    await expect(target).toHaveURL(remoteLink.url)
    expect(page.url()).toBe(homeUrl)
    expect(context.pages()).toHaveLength(2)
    await target.close()
  })
}
