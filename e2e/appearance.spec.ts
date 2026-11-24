import { expect, test } from '@playwright/test'

// Geometry and semantics, rather than machine-dependent font/pixel snapshots.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 800, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 760 },
  { width: 1280, height: 600 },
  { width: 390, height: 360 },
]) {
  test(`homepage keeps its visual hierarchy without clipping at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showClock: true, showSearchBar: true })))
    await page.goto('/')
    await expect(page.locator('.shortcut-page[aria-hidden="false"]')).toBeVisible()

    await expect(page.locator('.home-clock')).toHaveCount(1)
    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const search = bounds('.search-box')
      const grid = bounds('.shortcut-grid-wrap')
      const clock = bounds('.home-clock')
      const toolbar = bounds('.home-actions')
      const pager = bounds('.page-dots')
      return {
        viewportWidth: innerWidth,
        contentWidth: document.documentElement.scrollWidth,
        searchCenter: search.x + search.width / 2,
        clockCenter: clock.x + clock.width / 2,
        clockVisible: clock.height > 0,
        clockBottom: clock.bottom,
        toolbarBottom: toolbar.bottom,
        searchTop: search.top,
        searchBottom: search.bottom,
        gridTop: grid.top,
        gridBottom: grid.bottom,
        pagerTop: pager.top,
        pagerBottom: pager.bottom,
      }
    })
    expect(geometry.contentWidth).toBeLessThanOrEqual(viewport.width)
    expect(Math.abs(geometry.searchCenter - viewport.width / 2)).toBeLessThan(1)
    expect(geometry.searchTop).toBeGreaterThan(geometry.toolbarBottom)
    if (viewport.height > 560) {
      expect(geometry.clockVisible).toBe(true)
      expect(Math.abs(geometry.clockCenter - geometry.searchCenter)).toBeLessThan(1)
      expect(geometry.searchTop).toBeGreaterThan(geometry.clockBottom)
    } else {
      expect(geometry.clockVisible).toBe(false)
    }
    expect(geometry.gridTop).toBeGreaterThan(geometry.searchBottom)
    expect(geometry.pagerTop).toBeGreaterThanOrEqual(geometry.gridBottom)
    expect(geometry.pagerBottom).toBeLessThan(viewport.height - 24)
  })
}

test('tall calendar presets remain scrollable instead of clipping the mobile launcher', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ homeWidgetIds: ['calendar-summary', 'todo-summary', 'notes-summary'] }))
  })
  await page.goto('/')
  await expect(page.locator('.home-widget-calendar')).toBeVisible()
  const home = page.locator('main.home')
  await expect(home).toHaveCSS('overflow-y', 'auto')
  await page.locator('.page-dots').scrollIntoViewIfNeeded()
  await expect.poll(() => home.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const pager = await page.locator('.page-dots').boundingBox()
  expect(pager!.y).toBeGreaterThanOrEqual(0)
  expect(pager!.y + pager!.height).toBeLessThanOrEqual(844)
})

test('responsive columns do not overwrite the saved desktop grid or icon preferences', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ columns: 8, iconSize: 96, iconRadius: 50 }))
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const grid = page.locator('.shortcut-page[aria-hidden="false"]')
  const columns = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  await expect.poll(columns).toBe(8)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(columns).toBe(4)
  await page.setViewportSize({ width: 640, height: 900 })
  await expect.poll(columns).toBe(5)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect.poll(columns).toBe(8)
  await expect(grid).toHaveCSS('--shortcut-size', '96px')
  await expect(grid).toHaveCSS('--shortcut-radius', '50px')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.preferences.v1') ?? '{}'))
  expect(saved).toMatchObject({ columns: 8, iconSize: 96, iconRadius: 50 })
})

test('settings navigation stays below its measured header and switches remain keyboard operable', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('inftab.preferences.v1')) localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showClock: true, showSearchBar: true })) })
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const panel = page.getByRole('dialog', { name: '设置' })
  const nav = panel.getByRole('navigation', { name: '设置分区' })
  await nav.getByRole('button', { name: '首页', exact: true }).click()
  await expect(nav.getByRole('button', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'true')
  await expect.poll(async () => {
    const header = await panel.locator('.panel-header').boundingBox()
    const navigation = await nav.boundingBox()
    return Math.abs(navigation!.y - (header!.y + header!.height))
  }).toBeLessThan(2)
  await expect.poll(async () => {
    const heading = await panel.getByRole('heading', { name: '快捷入口', exact: true }).boundingBox()
    const navigation = await nav.boundingBox()
    return heading!.y - (navigation!.y + navigation!.height)
  }).toBeGreaterThan(0)

  await nav.getByRole('button', { name: '外观', exact: true }).click()
  const clockToggle = panel.getByRole('checkbox', { name: '显示时间和日期' })
  await clockToggle.focus()
  await page.keyboard.press('Space')
  await expect(clockToggle).not.toBeChecked()
  await expect(page.locator('.home-clock')).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(clockToggle).toBeChecked()
  await expect(panel.getByRole('button', { name: '雾林', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: '海面', exact: true }).click()
  await expect(panel.getByRole('button', { name: '海面', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('button', { name: '雾林', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('dark surfaces and the teleported engine menu share the same theme tokens', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('inftab.preferences.v1')) localStorage.setItem('inftab.preferences.v1', JSON.stringify({ showClock: true, showSearchBar: true })) })
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const panel = page.getByRole('dialog', { name: '设置' })
  await panel.getByRole('combobox', { name: '颜色主题' }).selectOption('dark')
  await expect(page.locator('main.home')).toHaveClass(/theme-dark/)
  await expect.poll(() => panel.locator('.settings-section').first().evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe('rgb(255, 255, 255)')
  const surfaces = await panel.evaluate((element) => {
    const card = element.querySelector('.settings-section')!
    const field = element.querySelector('.field-label input')!
    return { panel: getComputedStyle(element).backgroundColor, card: getComputedStyle(card).backgroundColor, field: getComputedStyle(field).backgroundColor }
  })
  expect(surfaces.panel).not.toBe(surfaces.card)
  expect(surfaces.card).not.toBe('rgb(255, 255, 255)')
  expect(surfaces.field).not.toBe('rgb(255, 255, 255)')
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '当前搜索引擎：Baidu' }).click()
  const menu = page.getByRole('listbox', { name: '选择搜索引擎' })
  await expect(menu).toHaveClass(/theme-dark/)
  await expect(menu).toHaveCSS('background-color', surfaces.card)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '当前搜索引擎：Baidu' })).toBeFocused()
})
