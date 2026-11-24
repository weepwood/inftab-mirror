import { expect, test } from '@playwright/test'

test('HTML preview, tags, batch deletion and IndexedDB recovery preserve data', async ({ page }) => {
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button', { name: '打开设置' }).click()
  const panel = page.getByRole('dialog', { name: '设置' })
  await panel.getByRole('button', { name: '数据', exact: true }).click()
  await panel.getByRole('button', { name: '打开数据管理' }).click()
  const manager = panel.locator('.shortcut-manager')
  await expect(manager).toBeVisible()
  await manager.locator('input[type=file]').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from('<a href="https://managed.example/">Managed example</a><a href="https://managed.example/">Duplicate</a><a href="javascript:alert(1)">Unsafe</a>') })
  await expect(manager.getByText('可导入 1 · 重复 1 · 无效 1 · 超出上限 0')).toBeVisible()
  await manager.getByRole('button', { name: '确认导入 1 项' }).click()
  await expect(manager.getByRole('status')).toContainText('已导入 1 个入口')
  await manager.getByLabel('搜索入口').fill('Managed example')
  await manager.getByRole('button', { name: '全选筛选结果' }).click()
  await manager.getByLabel('标签', { exact: true }).fill('学习')
  await manager.getByRole('button', { name: '添加标签' }).click()
  await expect(manager.locator('.manager-item')).toContainText('学习')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inftab.shortcuts.v1') ?? '[]').find((item: { url: string }) => item.url === 'https://managed.example/')?.tags)).toEqual(['学习'])
  await manager.getByRole('button', { name: '创建恢复点' }).click()
  await expect(manager.getByRole('status')).toContainText('已保存本地恢复点')
  await manager.getByRole('button', { name: '全选筛选结果' }).click()
  await manager.getByRole('button', { name: '批量删除' }).click()
  await manager.getByRole('button', { name: '确认删除所选入口' }).click()
  await expect(manager.getByRole('status')).toContainText('已处理 1 个入口')
  await expect(manager.locator('.manager-item')).toHaveCount(0)
  await manager.locator('.manager-history').filter({ hasText: '手动' }).first().getByRole('button', { name: '预览' }).click()
  await manager.getByRole('button', { name: '覆盖恢复' }).click()
  await expect(manager.getByRole('status')).toContainText('恢复完成')
  await expect(manager.locator('.manager-item')).toContainText('学习')
  const download = page.waitForEvent('download')
  await manager.getByRole('button', { name: '导出 HTML 书签' }).click()
  expect((await download).suggestedFilename()).toBe('inftab-bookmarks.html')
})


test('daily recovery points stay unique across simultaneous tabs and reloads', async ({ page, context }) => {
  const other = await context.newPage()
  const readEntries = () => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('inftab-backup-history')
    request.onupgradeneeded = () => { request.transaction?.abort(); resolve(0) }
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('snapshots')) { db.close(); resolve(0); return }
      const all = db.transaction('snapshots').objectStore('snapshots').getAll()
      all.onsuccess = () => { resolve(all.result.filter(item => item.reason === 'daily').length); db.close() }
      all.onerror = () => { db.close(); reject(all.error) }
    }
    request.onerror = () => reject(request.error)
  }))
  try {
    await Promise.all([page.goto('/'), other.goto('/')])
    // Wait until at least one automatic save has initialized the database before inspecting it.
    await page.waitForTimeout(2400)
    await expect.poll(readEntries).toBe(1)
    await Promise.all([page.reload(), other.reload()])
    await page.waitForTimeout(2400)
    await expect.poll(readEntries).toBe(1)
  } finally { await other.close() }
})
