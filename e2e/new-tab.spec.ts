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

test('settings persist and the main view fits a narrow viewport', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const showClock = page.getByLabel('显示时间和日期')
  await showClock.uncheck()
  await page.getByLabel('显示待办概览').check()
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

test('home widgets open their panel, reorder, and can be removed', async ({ page }) => {
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示待办概览').check()
  await page.getByLabel('显示倒计时').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const widgetTitles = page.locator('.home-widget-title')
  await expect(widgetTitles).toHaveText(['待办概览', '倒计时'])
  await page.getByRole('button', { name: '将待办概览下移' }).click()
  await expect(widgetTitles).toHaveText(['倒计时', '待办概览'])
  await expect(page.locator('.home-widget-shelf .visually-hidden[role="status"]')).toHaveText('待办概览已移到第2个位置。')
  await page.locator('[data-widget-id="todo-summary"] .home-widget-header')
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
  await page.getByLabel('显示待办概览').check()
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

test('notes widget previews the selected note and opens the notes panel', async ({ page }) => {
  await page.getByRole('button', { name: '打开笔记' }).click()
  const notesPanel = page.getByRole('dialog', { name: '笔记' })
  await notesPanel.getByRole('button', { name: '新建笔记' }).click()
  await notesPanel.getByLabel('笔记标题').fill('发布检查')
  await notesPanel.getByLabel('笔记内容').fill('确认打包、回归和发布记录。')
  await notesPanel.getByRole('button', { name: '关闭' }).click()

  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  await page.getByLabel('显示便签').check()
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
  await page.getByLabel('显示待办概览').check()
  await page.getByLabel('显示倒计时').check()
  await page.getByLabel('显示便签').check()
  await page.getByRole('button', { name: '关闭' }).click()

  const shelf = page.getByRole('region', { name: '首页小组件' })
  const cards = shelf.locator('.home-widget-card')
  await expect(cards).toHaveCount(3)
  const wideLayoutRows = await cards.evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().y))).size)
  expect(wideLayoutRows).toBe(1)
  await page.setViewportSize({ width: 800, height: 900 })
  const compactLayout = await shelf.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(compactLayout.columns).toBe(2)
  expect(compactLayout.scrollWidth).toBeLessThanOrEqual(compactLayout.clientWidth)
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
})
