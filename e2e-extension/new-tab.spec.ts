import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

test('loads the packaged MV3 extension as the browser new-tab page', async () => {
  const extensionPath = resolve('dist')
  const userDataDir = await mkdtemp(join(tmpdir(), 'inftab-extension-e2e-'))
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    })

    const page = context.pages()[0] ?? await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto('chrome://newtab/')

    await expect(page).toHaveURL(/^chrome-extension:\/\/[a-p]{32}\/index\.html/)
    await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()

    const extensionState = await page.evaluate(() => {
      const chromeApi = (window as unknown as {
        chrome?: {
          runtime?: { id?: string; getManifest?: () => { manifest_version?: number } }
          permissions?: { contains: (details: { permissions: string[] }) => Promise<boolean> }
        }
      }).chrome

      return Promise.all([
        chromeApi?.runtime?.id ?? '',
        chromeApi?.runtime?.getManifest?.().manifest_version ?? 0,
        chromeApi?.permissions?.contains({ permissions: ['bookmarks'] }) ?? true,
        chromeApi?.permissions?.contains({ permissions: ['history'] }) ?? true,
        chromeApi?.permissions?.contains({ permissions: ['tabs'] }) ?? true,
      ])
    })

    expect(extensionState[0]).toMatch(/^[a-p]{32}$/)
    expect(extensionState[1]).toBe(3)
    expect(extensionState[2]).toBe(false)
    expect(extensionState[3]).toBe(false)
    expect(extensionState[4]).toBe(false)

    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
    await page.getByRole('button', { name: /添加快捷入口/ }).click()
    const dialog = page.locator('.shortcut-dialog')
    await expect(dialog.getByRole('button', { name: '从打开的标签页导入' })).toBeVisible()
    await dialog.getByPlaceholder('例如：GitHub').fill('Extension E2E')
    await dialog.getByPlaceholder('https://example.com').fill('https://extension.example/')
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('inftab.shortcuts.v1'))).toContain('Extension E2E')
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()

    await page.keyboard.press('Control+f')
    const localSearch = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
    await localSearch.fill('Extension E2E')
    await expect(page.getByRole('option', { name: /Extension E2E/ })).toBeVisible()
    await page.reload()
    await page.keyboard.press('Control+f')
    await page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' }).fill('Extension E2E')
    await expect(page.getByRole('option', { name: /Extension E2E/ })).toBeVisible()

    await page.locator('[data-item-id="habits"] .shortcut-open').click()
    const habitsPanel = page.getByRole('dialog', { name: '习惯打卡' })
    await habitsPanel.getByRole('textbox', { name: '添加一个习惯' }).fill('Extension walk')
    await habitsPanel.getByRole('button', { name: '添加习惯' }).click()
    await habitsPanel.getByRole('button', { name: '完成Extension walk今日打卡' }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.habits.v1') ?? '[]')))
      .toEqual([expect.objectContaining({ title: 'Extension walk' })])
    await habitsPanel.getByRole('button', { name: '关闭' }).click()
    await page.evaluate(() => {
      const key = 'inftab.preferences.v1'
      const preferences = JSON.parse(localStorage.getItem(key) ?? '{}')
      localStorage.setItem(key, JSON.stringify({ ...preferences, homeWidgetIds: ['habits-summary'] }))
    })
    await page.reload()
    await expect(page.locator('[data-widget-id="habits-summary"]')).toContainText('今天完成 1 / 1 个习惯')

    const optionalPermissions = await page.evaluate(() => {
      const permissions = (window as unknown as {
        chrome: { permissions: { contains: (details: { permissions: string[] }) => Promise<boolean> } }
      }).chrome.permissions
      return Promise.all([
        permissions.contains({ permissions: ['bookmarks'] }),
        permissions.contains({ permissions: ['history'] }),
        permissions.contains({ permissions: ['tabs'] }),
      ])
    })
    expect(optionalPermissions).toEqual([false, false, false])
    expect(pageErrors).toEqual([])
  } finally {
    await context?.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
