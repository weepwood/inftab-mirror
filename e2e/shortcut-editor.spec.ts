import { expect, test, type Locator, type Page } from '@playwright/test'

const errorsByPage = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([])
})

async function openEditor(page: Page) {
  await page.getByRole('button', { name: '新建快捷入口', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await expect(dialog.locator('.shortcut-editor-form')).toBeVisible()
  return dialog
}

for (const themeMode of ['light', 'dark']) {
  for (const viewport of [
    { width: 1440, height: 1000 }, { width: 780, height: 600 },
    { width: 390, height: 844 }, { width: 390, height: 480 },
    { width: 320, height: 568 }, { width: 320, height: 360 },
  ]) {
    test(`shortcut editor keeps actions and expanded fields reachable: ${themeMode}, ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript((themeMode) => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ themeMode })), themeMode)
      await page.goto('/')
      const dialog = await openEditor(page)
      const close = dialog.getByRole('button', { name: '关闭', exact: true })
      const save = dialog.getByRole('button', { name: '保存', exact: true })
      const body = dialog.locator('.shortcut-editor-body')
      for (const target of [dialog, close, save]) {
        const box = (await target.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      }
      expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expect(dialog.locator('details')).not.toHaveAttribute('open')
      if (viewport.width <= 600) await expect(dialog.locator('#shortcut-name')).toHaveCSS('font-size', '16px')
      const summary = dialog.locator('summary')
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(dialog.locator('details')).toHaveAttribute('open', '')
      await dialog.locator('#shortcut-icon').scrollIntoViewIfNeeded()
      await expect(dialog.locator('#shortcut-icon')).toBeInViewport()
      const before = { close: (await close.boundingBox())!.y, save: (await save.boundingBox())!.y }
      await body.evaluate((element) => { element.scrollTop = 0 })
      expect((await close.boundingBox())!.y).toBe(before.close)
      expect((await save.boundingBox())!.y).toBe(before.save)
      for (const target of [dialog, body]) {
        expect(await target.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('.home-create-shortcut')).toBeFocused()
    })
  }
}

function contrast(foreground: number[], background: number[]) {
  const luminance = (channels: number[]) => channels.map((channel) => channel / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index]!, 0)
  const [light, dark] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (light! + .05) / (dark! + .05)
}
async function measuredColors(locator: Locator) {
  return locator.evaluate((element) => {
    const channels = (value: string) => value.match(/[\d.]+/g)!.map(Number)
    const style = getComputedStyle(element)
    let parent: Element | null = element
    let background: number[] = []
    while (parent) {
      const candidate = channels(getComputedStyle(parent).backgroundColor)
      if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break }
      parent = parent.parentElement
    }
    return { text: channels(style.color), background, border: channels(style.borderColor), focus: channels(style.outlineColor) }
  })
}

for (const themeMode of ['light', 'dark']) {
  test(`shortcut editor text, field boundaries and focus have measured contrast: ${themeMode}`, async ({ page }) => {
    await page.addInitScript((themeMode) => localStorage.setItem('inftab.preferences.v1', JSON.stringify({ themeMode })), themeMode)
    await page.goto('/')
    const dialog = await openEditor(page)
    for (const selector of ['header h2', 'header p', 'label[for="shortcut-name"]', '#shortcut-url-hint', '.shortcut-editor-status', '.button-primary', '.button-secondary', '.shortcut-appearance-heading strong', '.shortcut-appearance-heading > span']) {
      const colors = await measuredColors(dialog.locator(selector).first())
      expect(contrast(colors.text, colors.background), selector).toBeGreaterThanOrEqual(4.5)
    }
    const name = dialog.locator('#shortcut-name')
    await name.focus()
    const colors = await measuredColors(name)
    const surface = (await measuredColors(dialog.locator('header h2'))).background
    expect(contrast(colors.border, colors.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(colors.border, surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(colors.focus, colors.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(colors.focus, surface)).toBeGreaterThanOrEqual(3)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    const errorColors = await measuredColors(dialog.locator('#shortcut-name-error'))
    expect(contrast(errorColors.text, errorColors.background)).toBeGreaterThanOrEqual(4.5)
  })
}

test('native modal blocks the background and preserves keyboard, picker and nested-panel focus', async ({ page }) => {
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '设置', exact: true })
  const trigger = panel.getByRole('button', { name: /添加快捷入口/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  const name = dialog.locator('#shortcut-name')
  await expect(name).toBeFocused()
  await expect.poll(() => dialog.evaluate((element) => element.matches(':modal'))).toBe(true)
  await page.locator('.home-create-shortcut').evaluate((element) => (element as HTMLElement).focus())
  await expect(name).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  const picker = dialog.getByRole('combobox', { name: '所属工作区', exact: true })
  await picker.click()
  if (await page.evaluate(() => CSS.supports('appearance', 'base-select'))) {
    await expect.poll(() => picker.evaluate((element) => element.matches(':open'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(picker).toBeFocused()
  }
  await dialog.locator('summary').focus()
  await page.keyboard.press('Space')
  await expect(dialog.locator('details')).toHaveAttribute('open', '')
  // Composition Escape belongs to the input method, never to the overlay stack.
  await name.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(panel).toBeVisible()
  await expect(trigger).toBeFocused()
})

test('validation points to a recoverable field and valid bare domains still save locally', async ({ page }) => {
  await page.goto('/')
  const dialog = await openEditor(page)
  const name = dialog.locator('#shortcut-name')
  const url = dialog.locator('#shortcut-url')
  const save = dialog.getByRole('button', { name: '保存', exact: true })
  await name.fill('   ')
  await save.click()
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(name).toHaveAttribute('aria-describedby', 'shortcut-name-error')
  await name.fill('设计参考')
  await url.fill('javascript:alert(1)')
  await save.click()
  await expect(url).toBeFocused()
  await expect(url).toHaveAttribute('aria-describedby', /shortcut-url-error/)
  await expect(dialog.locator('#shortcut-url-error')).toContainText('https://example.com')
  await url.fill('example.com/design')
  await save.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.home-create-shortcut')).toBeFocused()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]')))
    .toContainEqual(expect.objectContaining({ title: '设计参考', url: 'https://example.com/design', mark: '设计' }))
  await page.reload()
  await page.locator('.home-search-toggle').click()
  await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('设计参考')
  await expect(page.getByRole('option', { name: /设计参考/ })).toBeVisible()
})

test('appearance previews are local, uploaded images can be cleared, and cancelled edits do not save', async ({ page }) => {
  let remoteRequests = 0
  await page.route('https://icons.example/**', (route) => { remoteRequests += 1; return route.abort() })
  await page.goto('/')
  const dialog = await openEditor(page)
  await dialog.locator('#shortcut-name').fill('视觉笔记')
  await expect(dialog.locator('.shortcut-icon-preview')).toHaveText('视觉')
  await dialog.locator('summary').click()
  await dialog.locator('#shortcut-color').fill('#467d68')
  await dialog.locator('#shortcut-mark').fill('UI')
  await expect(dialog.locator('.shortcut-icon-preview')).toHaveText('UI')
  await dialog.locator('#shortcut-icon').fill('https://icons.example/icon.png')
  await expect(dialog.locator('.shortcut-icon-preview img')).toHaveCount(0)
  await dialog.locator('summary').click()
  await dialog.locator('summary').click()
  expect(remoteRequests).toBe(0)
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const context = canvas.getContext('2d')!
    context.fillStyle = '#467d68'
    context.fillRect(0, 0, 16, 16)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'local.png', mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await expect(dialog.locator('.shortcut-icon-preview img')).toBeVisible()
  await expect(dialog.locator('#shortcut-icon')).toHaveValue(/^data:image\/webp;base64,/)
  await dialog.getByRole('button', { name: '使用文字图标', exact: true }).click()
  await expect(dialog.locator('#shortcut-icon')).toBeFocused()
  await expect(dialog.locator('.shortcut-icon-preview')).toHaveText('UI')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(remoteRequests).toBe(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]'))).not.toContainEqual(expect.objectContaining({ title: '视觉笔记' }))
})

test('text resizing, keyboard-only use and forced-colors retain visible actions and errors', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await page.goto('/')
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await page.locator('.home-create-shortcut').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await expect(dialog.locator('#shortcut-name')).toBeFocused()
  await expect(dialog.locator('.ui-select')).toHaveCSS('appearance', 'auto')
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('#shortcut-name')).toBeFocused()
  await expect(dialog.locator('#shortcut-name')).toHaveCSS('border-top-style', 'dashed')
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
})

test('pointer-only hover and press do not introduce an entrance or reduced-motion transform', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.locator('.home-create-shortcut').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '添加快捷入口', exact: true })
  await expect(dialog.locator('#shortcut-name')).toBeFocused()
  await expect(dialog).toHaveCSS('animation-name', 'none')
  const save = dialog.getByRole('button', { name: '保存', exact: true })
  await save.focus()
  await page.keyboard.down('Space')
  await expect(save).toHaveCSS('transform', 'none')
  await page.keyboard.up('Space')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const box = (await save.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(save).toHaveCSS('transform', 'none')
  await page.mouse.up()
  // Native light-dismiss is enhanced where closedby is supported; explicit
  // close and Escape remain available in browsers without that enhancement.
  if (await dialog.evaluate((element) => 'closedBy' in element)) {
    await page.mouse.click(2, 2)
    await expect(dialog).toHaveCount(0)
  }
})

test.describe('touch shortcut editor', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 640 } })
  test('does not summon the keyboard on open and uses readable, non-sticky controls', async ({ page }) => {
    await page.goto('/')
    const dialog = await openEditor(page)
    const close = dialog.getByRole('button', { name: '关闭', exact: true })
    await expect(close).toBeFocused()
    await expect(dialog.locator('#shortcut-name')).toHaveCSS('font-size', '16px')
    await expect(dialog.locator('summary')).toBeInViewport({ ratio: 1 })
    await close.tap()
    await expect(dialog).toHaveCount(0)
  })
})
