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

    await page.route('https://translate.google.com/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<title>Translation test</title>',
    }))
    await page.getByRole('searchbox', { name: '输入并搜索' }).fill('extension & hello')
    await page.getByRole('button', { name: '翻译成简体中文' }).click()
    await expect(page).toHaveURL(/translate\.google\.com\/\?sl=auto&tl=zh-CN&text=extension%20%26%20hello&op=translate/)
    await page.goto('chrome://newtab/')
    await expect(page).toHaveURL(/^chrome-extension:\/\/[a-p]{32}\/index\.html/)
    await expect(page.getByRole('heading', { name: 'Infinity 新标签页' })).toBeVisible()

    const extensionState = await page.evaluate(() => {
      const chromeApi = (window as unknown as {
        chrome?: {
          runtime?: { id?: string; getManifest?: () => { manifest_version?: number } }
          permissions?: {
            contains: (details: { permissions?: string[]; origins?: string[] }) => Promise<boolean>
          }
        }
      }).chrome

      return Promise.all([
        chromeApi?.runtime?.id ?? '',
        chromeApi?.runtime?.getManifest?.().manifest_version ?? 0,
        chromeApi?.permissions?.contains({ permissions: ['bookmarks'] }) ?? true,
        chromeApi?.permissions?.contains({ permissions: ['history'] }) ?? true,
        chromeApi?.permissions?.contains({ permissions: ['tabs'] }) ?? true,
        chromeApi?.permissions?.contains({ permissions: ['topSites'] }) ?? true,
        chromeApi?.permissions?.contains({ origins: ['https://api.open-meteo.com/*', 'https://geocoding-api.open-meteo.com/*'] }) ?? true,
      ])
    })

    expect(extensionState[0]).toMatch(/^[a-p]{32}$/)
    expect(extensionState[1]).toBe(3)
    expect(extensionState[2]).toBe(false)
    expect(extensionState[3]).toBe(false)
    expect(extensionState[4]).toBe(false)
    expect(extensionState[5]).toBe(false)
    expect(extensionState[6]).toBe(false)

    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
    await page.getByRole('button', { name: /添加快捷入口/ }).click()
    const dialog = page.locator('.shortcut-dialog')
    await expect(dialog.getByRole('button', { name: '从打开的标签页导入' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '从常用网站导入' })).toBeVisible()
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

    await page.keyboard.press('Escape')
    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
    await page.getByRole('button', { name: '新建文件夹' }).click()
    const folderEditor = page.getByRole('dialog', { name: '新建文件夹' })
    await folderEditor.getByLabel('文件夹名称').fill('扩展工作')
    await folderEditor.getByRole('checkbox', { name: /Extension E2E/ }).check()
    await folderEditor.getByRole('button', { name: '保存文件夹' }).click()
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
    await page.evaluate(() => {
      Object.defineProperty(window, '__openedShortcutUrls', { configurable: true, value: [] as string[] })
      Object.defineProperty(window, 'open', {
        configurable: true,
        value: (url: string) => {
          (window as unknown as Window & { __openedShortcutUrls: string[] }).__openedShortcutUrls.push(url)
          return null
        },
      })
    })
    await page.keyboard.press('Control+f')
    const folderSearch = page.getByRole('searchbox', { name: '搜索快捷入口名称或网址' })
    await folderSearch.fill('extension.example')
    const folderResult = page.getByRole('option', { name: /扩展工作 · Extension E2E/ })
    await expect(folderResult).toBeVisible()
    await folderResult.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as Window & { __openedShortcutUrls: string[] }).__openedShortcutUrls))
      .toEqual(['https://extension.example/'])

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
        permissions.contains({ permissions: ['topSites'] }),
      ])
    })
    expect(optionalPermissions).toEqual([false, false, false, false])

    await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
    const extensionSettings = page.getByRole('dialog', { name: '设置' })
    await extensionSettings.getByLabel('显示天气小组件').check()
    await extensionSettings.getByLabel('显示热门资讯小组件').check()
    await extensionSettings.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('[data-widget-id="weather-summary"] .weather-summary-authorize')).toContainText('授权并获取天气')
    await expect(page.locator('[data-widget-id="news-summary"]')).toContainText('需要单独授权网络访问')
    const newsPermission = await page.evaluate(() => {
      const permissions = (window as unknown as {
        chrome: { permissions: { contains: (details: { origins: string[] }) => Promise<boolean> } }
      }).chrome.permissions
      return permissions.contains({ origins: ['https://hacker-news.firebaseio.com/*'] })
    })
    expect(newsPermission).toBe(false)

    await page.evaluate(() => {
      const key = 'inftab.preferences.v1'
      const preferences = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...preferences, columns: 2, rows: 1, pageTransitionEffect: 'slide' }))
    })
    await page.reload()
    const activePage = page.locator('.shortcut-page[aria-hidden="false"]')
    await activePage.locator('.shortcut-open').nth(1).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.page-dot[aria-current="page"]')).toHaveAttribute('aria-label', '第2页')
    await expect(page.locator('.shortcut-page[aria-hidden="false"] .shortcut-open').nth(1)).toBeFocused()

    expect(pageErrors).toEqual([])
  } finally {
    await context?.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
