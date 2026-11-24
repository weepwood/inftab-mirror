import { expect, test, type Page } from '@playwright/test'

const errorsByPage = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})
test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([])
})

const hiddenTools = ['weather', 'countdowns', 'habits', 'todos', 'focus-timer', 'notes', 'bookmarks', 'history', 'calculator', 'calendar']
for (const effect of ['particles', 'slide', 'trails'] as const) {
  for (const layout of [
    { width: 1440, height: 1000, columns: 6, rows: 3, names: true },
    { width: 390, height: 844, columns: 4, rows: 3, names: true },
    { width: 390, height: 360, columns: 4, rows: 3, names: false },
  ]) {
    test(`page dots stay anchored on a one-item last page: ${effect}, ${layout.width}×${layout.height}`, async ({ page }) => {
      await page.setViewportSize(layout)
      await page.addInitScript(({ effect, layout, hiddenTools }) => {
        localStorage.setItem('inftab.preferences.v1', JSON.stringify({
          columns: layout.columns, rows: layout.rows, showNames: layout.names,
          pageTransitionEffect: effect, pageTransitionMs: 160, hiddenLauncherIds: hiddenTools,
        }))
        // One visible built-in plus a full page of websites leaves exactly one
        // item on the last page, independent of defaults or future new tools.
        localStorage.setItem('inftab.shortcuts.v1', JSON.stringify(Array.from({ length: layout.columns * layout.rows }, (_, index) => ({
          id: `geometry-${index}`, title: `Website ${index}`, url: `https://site-${index}.example/`, color: '#467d68', mark: 'W',
        }))))
      }, { effect, layout, hiddenTools })
      await page.goto('/')
      const active = page.locator('.shortcut-page[aria-hidden="false"]')
      await expect(active.locator('.shortcut-cell')).toHaveCount(layout.columns * layout.rows)
      const pager = page.getByRole('navigation', { name: '快捷入口页码' })
      await expect(pager.getByRole('button')).toHaveCount(2)
      await expect(page.locator('.page-arrow')).toHaveCount(0)
      const fullGrid = await active.boundingBox()
      const first = await pager.boundingBox()
      await pager.getByRole('button', { name: '第2页', exact: true }).click()
      await expect(active.locator('.shortcut-cell')).toHaveCount(1)
      await expect(page.locator('.particles-out, .particles-in, .trails-out')).toHaveCount(0)
      const shortGrid = await active.boundingBox()
      const last = await pager.boundingBox()
      expect(Math.abs(shortGrid!.height - fullGrid!.height)).toBeLessThan(1)
      expect(Math.abs(last!.y - first!.y)).toBeLessThan(1)
      expect(Math.abs(last!.x + last!.width / 2 - layout.width / 2)).toBeLessThan(1)
      expect(last!.y + last!.height).toBeLessThan(layout.height - 24)
      await page.keyboard.press('ArrowLeft')
      await expect(pager.locator('[aria-current="page"]')).toHaveAttribute('aria-label', '第1页')
    })
  }
}

for (const themeMode of ['light', 'dark'] as const) {
  test(`the ${themeMode} native dropdown stays in the viewport and Escape closes only the picker`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 360 })
    await page.addInitScript((themeMode) => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ themeMode })), themeMode)
    await page.goto('/')
    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
    const panel = page.getByRole('dialog', { name: '设置' })
    const select = panel.getByRole('combobox', { name: '颜色主题' })
    await expect(select).toHaveClass(/ui-select/)
    await select.click()
    const enhanced = await page.evaluate(() => CSS.supports('appearance', 'base-select'))
    if (enhanced) {
      await expect.poll(() => select.evaluate((element) => element.matches(':open'))).toBe(true)
      for (const label of ['浅色', '深色', '跟随系统']) {
        const option = page.getByRole('option', { name: label, exact: true })
        const bounds = await option.boundingBox()
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(360)
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
      }
      await page.keyboard.press('Escape')
      await expect(panel).toBeVisible()
      await expect(select).toBeFocused()
      await expect.poll(() => select.evaluate((element) => element.matches(':open'))).toBe(false)
    } else await page.keyboard.press('Escape')
    await select.selectOption(themeMode === 'light' ? 'dark' : 'light')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}').themeMode))
      .toBe(themeMode === 'light' ? 'dark' : 'light')
    await select.focus()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('combobox', { name: '界面配色' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('checkbox', { name: '显示时间和日期' })).toBeFocused()
  })
}

test('native dropdown fallback remains keyboard-accessible without the enhanced picker', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '.select-field > .ui-select, .ui-select::picker(select) { appearance: auto !important; }' })
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const select = page.getByRole('combobox', { name: '颜色主题' })
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await expect(select).toHaveValue('dark')
  await expect(page.locator('.home')).toHaveClass(/theme-dark/)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: '界面配色' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('checkbox', { name: '显示时间和日期' })).toBeFocused()
})

test('forced-colors mode restores a system picker and keeps keyboard selection usable', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const panel = page.getByRole('dialog', { name: '设置' })
  const select = panel.getByRole('combobox', { name: '颜色主题' })
  await expect(select).toHaveCSS('appearance', 'auto')
  await expect(panel.locator('.select-chevron').first()).toBeHidden()
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await expect(select).toHaveValue('dark')
})

test('all opening choices survive reload and are included in the on-demand JSON download', async ({ page }) => {
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  let panel = page.getByRole('dialog', { name: '设置' })
  const choices = {
    openShortcutsInNewTab: false, openSearchInNewTab: true, openBookmarksInNewTab: false, openHistoryInNewTab: false,
  }
  await panel.getByRole('checkbox', { name: '在新标签页中打开网站', exact: true }).uncheck()
  await panel.getByRole('checkbox', { name: '在新标签页中打开搜索结果', exact: true }).check()
  await panel.getByRole('checkbox', { name: '在新标签页中打开书签链接', exact: true }).uncheck()
  await panel.getByRole('checkbox', { name: '在新标签页中打开历史记录', exact: true }).uncheck()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}'))).toMatchObject(choices)
  await page.reload()
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  panel = page.getByRole('dialog', { name: '设置' })
  await expect(panel.getByRole('checkbox', { name: '在新标签页中打开网站', exact: true })).not.toBeChecked()
  await expect(panel.getByRole('checkbox', { name: '在新标签页中打开搜索结果', exact: true })).toBeChecked()
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: '导出 JSON 备份' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).preferences).toMatchObject(choices)
  expect(download.suggestedFilename()).toMatch(/^inftab-backup-\d{4}-\d{2}-\d{2}\.json$/)
})

test('opt-in third-party search opens a new tab without navigating the launcher', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showSearchBar: true, openSearchInNewTab: true, engine: 'google' })))
  await context.route('https://www.google.com/search*', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Search result</title>' }))
  await page.goto('/')
  const homeUrl = page.url()
  const openedPromise = context.waitForEvent('page')
  await page.getByRole('searchbox', { name: '输入并搜索' }).fill('opening choice')
  await page.getByRole('searchbox', { name: '输入并搜索' }).press('Enter')
  const opened = await openedPromise
  await expect(opened).toHaveURL('https://www.google.com/search?q=opening%20choice')
  expect(page.url()).toBe(homeUrl)
  await opened.close()
})

for (const source of ['grid', 'dock', 'folder', 'local-search'] as const) {
  test(`current-tab website opening is consistent from ${source}`, async ({ page, context }) => {
    await page.addInitScript((source) => {
      localStorage.setItem('inftab.preferences.v1', JSON.stringify({ openShortcutsInNewTab: false, dockItemIds: ['target-link'] }))
      localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([{ id: 'target-link', title: '目标网址', url: 'https://opening.example/landing', color: '#467d68', mark: 'O' }]))
      if (source === 'folder') localStorage.setItem('inftab.folders.v1', JSON.stringify([{ id: 'target-folder', title: '目标文件夹', color: '#467d68', mark: 'F', shortcutIds: ['target-link'] }]))
    }, source)
    await context.route('https://opening.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Target website</title>' }))
    await page.goto('/')
    if (source === 'grid') await page.locator('[data-item-id="target-link"] .shortcut-open').click()
    else if (source === 'dock') await page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开目标网址', exact: true }).click()
    else if (source === 'folder') {
      await page.locator('[data-item-id="target-folder"] .shortcut-open').click()
      await page.getByRole('dialog', { name: '目标文件夹' }).getByRole('button', { name: '目标网址', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '查找快捷入口', exact: true }).click()
      await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('目标网址')
      await page.getByRole('option', { name: /目标网址/ }).click()
    }
    await expect(page).toHaveURL('https://opening.example/landing')
    expect(context.pages()).toHaveLength(1)
  })
}

test('action menus share keyboard navigation and restore focus on Escape', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: ['calendar'] })))
  await page.goto('/')
  const shortcut = page.locator('[data-item-id="jd"] .shortcut-open')
  await shortcut.focus()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu', { name: '京东商城 的操作' })
  await expect(menu.getByRole('menuitem', { name: '编辑快捷入口' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: '删除快捷入口' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: '编辑快捷入口' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(shortcut).toBeFocused()
  const dockItem = page.getByRole('navigation', { name: '常驻 Dock' }).getByRole('button', { name: '打开日历' })
  await dockItem.focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: '从 Dock 移除日历' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(dockItem).toBeFocused()

  const workspaceTrigger = page.locator('.home-workspace-trigger')
  await workspaceTrigger.click()
  const workspace = page.getByRole('group', { name: '切换工作区' }).getByRole('button', { name: '主页', exact: true })
  await expect(workspace).toBeFocused()
  const workspaceAction = page.getByRole('button', { name: '主页 的操作' })
  await workspaceAction.click()
  const workspaceMenu = page.getByRole('menu', { name: '主页 的操作' })
  await expect(workspaceMenu.getByRole('menuitem', { name: '重命名' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(workspaceMenu.getByRole('menuitem', { name: '重命名' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(workspaceMenu).toHaveCount(0)
  await expect(workspaceAction).toBeFocused()
  await workspaceAction.click()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  const workspaceName = page.getByRole('textbox', { name: '工作区名称' })
  await workspaceName.fill('保留')
  await page.mouse.move(0, 0)
  await workspaceName.pressSequentially('名称', { delay: 180 })
  await workspaceName.press('Enter')
  await expect(page.getByRole('group', { name: '切换工作区' }).getByRole('button', { name: '保留名称', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await shortcut.focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(menu).toHaveCount(0)
})

test('clean default homepage preserves on-demand search and wheel wrap', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home-clock')).toHaveCount(0)
  await expect(page.locator('.search-area')).toHaveCount(0)
  const dots = page.locator('.page-dot')
  await expect.poll(() => dots.count()).toBeGreaterThan(1)
  await page.locator('.shortcut-grid-viewport').hover()
  await page.mouse.wheel(0, -100)
  await expect(dots.last()).toHaveAttribute('aria-current', 'page')
  await page.mouse.wheel(0, 100)
  await expect(dots.first()).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })).toBeFocused()
})

test('continuous slide retains visible slots during fast alternating wheel input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ columns: 2, rows: 1, pageTransitionEffect: 'slide', pageTransitionMs: 300 })))
  await page.goto('/')
  const viewport = page.locator('.shortcut-grid-viewport')
  await viewport.hover()
  for (const delta of [100, 100, -100, 100, -100]) await page.mouse.wheel(0, delta)
  await expect(page.locator('.shortcut-pages.continuous-slide')).toBeVisible()
  await expect.poll(() => page.locator('.shortcut-page').count()).toBeLessThanOrEqual(4)
  await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toHaveCount(1)
  await expect.poll(() => page.locator('.shortcut-pages').evaluate(el => Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41))).toBeLessThan(2)
})
