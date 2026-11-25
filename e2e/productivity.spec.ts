import { expect, test, type Page } from '@playwright/test'

const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
})

async function seed(page: Page, records: Record<string, unknown>) {
  await page.evaluate((values) => {
    window.dispatchEvent(new Event('pagehide'))
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value))
  }, records)
  await page.reload()
}

async function openTool(page: Page, title: string) {
  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill(title)
  await page.getByRole('option', { name: title, exact: true }).click()
  await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible()
}

test('the phone toolbar creates a shortcut directly without overlapping the brand', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  // Measure both boxes in the same rendering state after resize. Preserve the
  // 8px gap contract even while crossing responsive breakpoints repeatedly.
  const gap=()=>page.evaluate(()=>{
    const brand=document.querySelector('.home-brand')!.getBoundingClientRect()
    const toolbar=document.querySelector('.home-actions')!.getBoundingClientRect()
    return toolbar.x-brand.right
  })
  for(const width of [320,360,480,320]){
    await page.setViewportSize({width,height:760})
    await expect.poll(gap).toBeGreaterThanOrEqual(8)
  }
  const create = page.getByRole('button', { name: '新建快捷入口', exact: true })
  await create.click()
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await dialog.getByPlaceholder('例如：GitHub').fill('Quick launch')
  await dialog.getByPlaceholder('https://example.com').fill('https://quick.example/path')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(create).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('quick.example')
  await expect(page.getByRole('option', { name: /Quick launch/ })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('Quick launch')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('visible local search works with a hidden search bar and supports a keyboard round trip', async ({ page }) => {
  await seed(page, { 'inftab.preferences.v1': { showSearchBar: false, themeMode: 'dark' } })
  await expect(page.locator('.search-area')).toHaveCount(0)
  const toggle = page.getByRole('button', { name: '查找快捷入口', exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(0, 0)
  await expect(toggle).toHaveCSS('background-color', 'rgb(44, 64, 52)')
  const search = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
  await expect(search).toBeFocused()
  await search.fill('计算器')
  await search.press('ArrowDown')
  const result = page.getByRole('option', { name: '计算器', exact: true })
  await expect(result).toBeFocused()
  await result.press('ArrowUp')
  await expect(search).toBeFocused()
  await page.getByRole('button', { name: '退出快捷入口搜索' }).click()
  await expect(page.locator('.search-area')).toHaveCount(0)
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.click()
  await search.fill('计算器')
  // The lazy result view intentionally ignores Enter until a visible result exists.
  await expect(result).toBeVisible()
  await search.press('Enter')
  const panel = page.getByRole('dialog', { name: '计算器', exact: true })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(toggle).toBeFocused()
  await expect(page.locator('.search-area')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').showSearchBar)).toBe(false)
})

test('todo filtering, inline editing, and adding keep keyboard focus and reveal new tasks', async ({ page }) => {
  await seed(page, { 'inftab.todos.v1': [
    { id: 'report', title: 'Review Report', done: false },
    { id: 'walk', title: 'Walk outside', done: false },
    { id: 'done', title: 'Done yesterday', done: true },
  ] })
  await openTool(page, '待办事项')
  const panel = page.getByRole('dialog', { name: '待办事项', exact: true })
  const filters = panel.getByRole('group', { name: '待办状态' })
  await filters.getByRole('button', { name: /^待完成/ }).click()
  await expect(panel.locator('.todo-list li')).toHaveCount(2)
  const search = panel.getByRole('searchbox', { name: '查找待办' })
  await search.fill('  REPORT  ')
  await expect(panel.locator('.todo-list li')).toHaveCount(1)
  await panel.getByRole('button', { name: '编辑待办', exact: true }).click()
  const edit = panel.getByRole('textbox', { name: '编辑待办' })
  await expect(edit).toBeFocused()
  expect(await edit.evaluate((element) => ({ start: (element as HTMLInputElement).selectionStart, end: (element as HTMLInputElement).selectionEnd })))
    .toEqual({ start: 0, end: 'Review Report'.length })
  await edit.press('Escape')
  await expect(panel.getByRole('button', { name: '编辑待办', exact: true })).toBeFocused()
  await panel.getByRole('button', { name: '编辑待办', exact: true }).click()
  await edit.fill('Ship release')
  await edit.press('Enter')
  await expect(panel.getByText('没有符合条件的待办')).toBeVisible()
  const draft = panel.getByRole('textbox', { name: '添加一项待办' })
  await expect(draft).toBeFocused()
  await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
  await expect(panel.locator('.todo-list li')).toHaveCount(3)

  await filters.getByRole('button', { name: /^已完成/ }).click()
  await search.fill('yesterday')
  await draft.fill('New task from a filtered list')
  await draft.press('Enter')
  await expect(search).toHaveValue('')
  await expect(filters.getByRole('button', { name: /^待完成/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.locator('.todo-list li')).toHaveCount(3)
  await expect(panel.getByText('New task from a filtered list', { exact: true })).toBeVisible()
  await expect(draft).toBeFocused()
  const newRow = panel.locator('.todo-list li').filter({ hasText: 'New task from a filtered list' })
  await newRow.getByRole('button', { name: '标记为完成', exact: true }).click()
  await expect(panel.locator('.todo-list li')).toHaveCount(2)
  await expect(panel.locator('.todo-check').first()).toBeFocused()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')))
    .toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Ship release' }), expect.objectContaining({ title: 'New task from a filtered list', done: true })]))
})

test('clearing completed tasks stays global and requires confirmation under an active filter', async ({ page }) => {
  await seed(page, { 'inftab.todos.v1': [
    { id: 'open', title: 'Keep this open task', done: false },
    { id: 'one', title: 'Completed One', done: true },
    { id: 'two', title: 'Completed Two', done: true },
  ] })
  await openTool(page, '待办事项')
  const panel = page.getByRole('dialog', { name: '待办事项', exact: true })
  await panel.getByRole('searchbox', { name: '查找待办' }).fill('one')
  await expect(panel.locator('.todo-list li')).toHaveCount(1)
  const clear = panel.getByRole('button', { name: '清除已完成（2）', exact: true })
  await clear.click()
  const confirm = page.getByRole('alertdialog', { name: '清除已完成待办？', exact: true })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(clear).toBeFocused()
  await expect(panel.locator('.todo-list li')).toHaveCount(1)
  await clear.click()
  await confirm.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(panel.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
  await expect(panel.locator('.todo-list li')).toHaveCount(1)
  await expect(panel.locator('.todo-list')).toHaveText('Keep this open task')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.todos.v1') ?? '[]')))
    .toEqual([{ id: 'open', title: 'Keep this open task', done: false }])
})

test('notes search and sorting keep the current editor and its saved changes stable', async ({ page }) => {
  await seed(page, {
    'inftab.notes.v1': [
      { id: 'z', title: 'Zulu', body: 'Current text', updatedAt: 5 },
      { id: 'a', title: 'Alpha', body: 'A NEEDLE in the body', updatedAt: 10 },
      { id: 'b', title: 'Beta', body: '中文正文', updatedAt: 20 },
    ],
    'inftab.active-note.v1': 'z',
  })
  await openTool(page, '笔记')
  const panel = page.getByRole('dialog', { name: '笔记', exact: true })
  const search = panel.getByRole('searchbox', { name: '查找笔记' })
  await search.fill('  needle  ')
  await expect(panel.locator('.note-list-item')).toHaveCount(1)
  await expect(panel.locator('.note-list-item')).toContainText('Alpha')
  const title = panel.getByRole('textbox', { name: '笔记标题' })
  await expect(title).toHaveValue('Zulu')
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(panel).toBeVisible()
  const sort = panel.getByRole('combobox', { name: '笔记排序' })
  await sort.selectOption('updated')
  await expect(panel.locator('.note-list-item strong')).toHaveText(['Beta', 'Alpha', 'Zulu'])
  await sort.selectOption('title')
  await expect(panel.locator('.note-list-item strong')).toHaveText(['Alpha', 'Beta', 'Zulu'])
  await sort.selectOption('original')
  await expect(panel.locator('.note-list-item strong')).toHaveText(['Zulu', 'Alpha', 'Beta'])
  await search.fill('no such note')
  await expect(panel.getByText('没有匹配的笔记', { exact: true })).toBeVisible()
  await expect(title).toHaveValue('Zulu')
  await panel.getByRole('textbox', { name: '笔记内容' }).fill('Updated 😀 text')
  await expect(panel.locator('.note-meta')).toContainText('14 字符')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.notes.v1') ?? '[]').find((note: { id: string }) => note.id === 'z')?.body))
    .toBe('Updated 😀 text')
  await page.reload()
  await openTool(page, '笔记')
  await expect(title).toHaveValue('Zulu')
  await expect(panel.getByRole('textbox', { name: '笔记内容' })).toHaveValue('Updated 😀 text')
})

test('mobile note tools stay reachable on long lists and creating clears search and focuses the title', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await seed(page, {
    'inftab.preferences.v1': { themeMode: 'dark' },
    'inftab.notes.v1': Array.from({ length: 60 }, (_, index) => ({
      id: `note-${index}`, title: `A very long note title ${index}`, body: `Body ${index}`, updatedAt: index,
    })),
    'inftab.active-note.v1': 'note-0',
  })
  await openTool(page, '笔记')
  const panel = page.getByRole('dialog', { name: '笔记', exact: true })
  await panel.locator('.note-list-item').last().scrollIntoViewIfNeeded()
  const create = panel.getByRole('button', { name: '新建笔记', exact: true })
  const search = panel.getByRole('searchbox', { name: '查找笔记' })
  await expect(create).toBeInViewport()
  await expect(search).toBeInViewport()
  await expect(search).not.toHaveCSS('color', 'rgb(255, 255, 255)')
  await search.fill('no matches')
  await create.click()
  await expect(search).toHaveValue('')
  const title = panel.getByRole('textbox', { name: '笔记标题' })
  await expect(title).toBeFocused()
  await expect(title).toHaveValue('')
  await title.fill('New note')
  await panel.getByRole('textbox', { name: '笔记内容' }).fill('A😀中')
  await expect(panel.locator('.note-meta')).toContainText('3 字符')
  await expect(panel.getByRole('button', { name: '删除笔记', exact: true })).toBeInViewport()
  expect(await panel.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.notes.v1') ?? '[]')[0]?.title)).toBe('New note')
})
