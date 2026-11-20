import { expect, test, type Page } from '@playwright/test'
import { maxDockItems } from '../src/types'

const pageErrorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page) ?? []).toEqual([])
})

test('shortcut menus skip disabled Dock actions and return focus on Escape', async ({ page }) => {
  await page.addInitScript((limit) => {
    const shortcuts = Array.from({ length: limit + 1 }, (_, index) => ({
      id: `example-${index}`, title: `Example ${index}`, url: `https://example.com/${index}`, color: '#336699', mark: 'E',
    }))
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify(shortcuts))
    localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: shortcuts.slice(1).map((item) => item.id) }))
  }, maxDockItems)
  await page.goto('/')

  const opener = page.locator('.shortcut-page[aria-hidden="false"] [data-item-id="example-0"] .shortcut-open')
  await opener.focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: '编辑快捷入口', exact: true })).toBeFocused()
  await expect(page.getByRole('menuitem', { name: '固定到 Dock', exact: true })).toBeDisabled()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '复制网址', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: '删除快捷入口', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: '复制网址', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('folders focus the first saved shortcut and restore focus after closing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([
      { id: 'first', title: 'First', url: 'https://example.com/first', color: '#336699', mark: 'F' },
      { id: 'second', title: 'Second', url: 'https://example.com/second', color: '#336699', mark: 'S' },
    ]))
    localStorage.setItem('inftab.folders.v1', JSON.stringify([
      { id: 'work', title: 'Work', shortcutIds: ['second', 'first'], color: '#336699', mark: 'W' },
    ]))
    localStorage.setItem('inftab.launcher-order.v1', JSON.stringify(['work']))
  })
  await page.goto('/')

  const opener = page.getByRole('button', { name: '打开Work', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Work', exact: true })
  await expect(dialog.locator('.folder-launcher').first()).toContainText('Second')
  await expect(dialog.locator('.folder-launcher').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})
