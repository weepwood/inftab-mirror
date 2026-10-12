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
      ])
    })

    expect(extensionState[0]).toMatch(/^[a-p]{32}$/)
    expect(extensionState[1]).toBe(3)
    expect(extensionState[2]).toBe(false)
    expect(extensionState[3]).toBe(false)
    expect(pageErrors).toEqual([])
  } finally {
    await context?.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
