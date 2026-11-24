import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 480 }, { width: 320, height: 360 }]) {
  test(`workspace list remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(({ dark }) => {
      if (localStorage.getItem('inftab.home-workspaces.v1')) return
      const workspaces = Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? 'default' : `work-${index}`, name: index === 0 ? '主页' : `工作区 ${index}`, itemIds: [] }))
      localStorage.setItem('inftab.home-workspaces.v1', JSON.stringify(workspaces))
      localStorage.setItem('inftab.active-home-workspace.v1', JSON.stringify('work-1'))
      localStorage.setItem('inftab.preferences.v1', JSON.stringify({ dockItemIds: ['weather', 'todos', 'calendar', 'notes'], themeMode: dark ? 'dark' : 'light' }))
    }, { dark: viewport.width === 320 })
    await page.goto('/')
    const trigger = page.locator('.home-workspace-trigger')
    await expect(trigger).toContainText('工作区 1')
    const dock = page.locator('.home-dock')
    await expect(dock).toBeVisible()
    const triggerBounds = (await trigger.boundingBox())!
    const dockBounds = (await dock.boundingBox())!
    expect(dockBounds.x + dockBounds.width).toBeLessThanOrEqual(triggerBounds.x)
    await trigger.click()
    const panel = page.locator('.workspace-panel')
    const bounds = (await panel.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    await expect(page.getByRole('button', { name: '已达到 20 个工作区上限' })).toBeDisabled()
    const filter = page.getByRole('searchbox', { name: '查找工作区' })
    await filter.fill('19')
    await expect(page.locator('.home-workspace-tab')).toHaveCount(1)
    const filteredBounds = await page.locator('.home-workspace-tab').boundingBox()
    expect(filteredBounds?.height ?? 0).toBeGreaterThan(0)
    if (viewport.height <= 440) {
      await expect(panel).toHaveCSS('overflow-y', 'auto')
      await expect(page.locator('.workspace-list')).toHaveCSS('overflow-y', 'visible')
    }
    await page.getByRole('button', { name: '工作区 19', exact: true }).click()
    await expect(trigger).toContainText('工作区 19')
    await page.reload()
    await expect(trigger).toContainText('工作区 19')
  })
}

test('creation validates names and deletion names the renamed default workspace', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const trigger = page.locator('.home-workspace-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '主页 的操作' }).click()
  await page.getByRole('menuitem', { name: '重命名' }).click()
  await page.getByRole('textbox', { name: '工作区名称' }).fill('我的主页')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: '新建工作区' }).click()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请输入')
  await page.getByRole('textbox', { name: '工作区名称' }).fill('我的主页')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('已被使用')
  await page.getByRole('textbox', { name: '工作区名称' }).fill('工作')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(trigger).toContainText('工作')
  await trigger.click()
  await page.getByRole('button', { name: '工作 的操作' }).click()
  await page.getByRole('menuitem', { name: '删除工作区' }).click()
  await expect(page.getByRole('alertdialog', { name: '删除工作区？' })).toContainText('会移回“我的主页”')
})
