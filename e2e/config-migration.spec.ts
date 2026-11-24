import { expect, test } from '@playwright/test'
import { defaultPreferences } from '../src/data/defaults'
test('selective migration preserves entries and creates a recovery point', async ({page}) => {
  await page.goto('/')
  const before = await page.evaluate(()=>localStorage.getItem('inftab.shortcuts.v1'))
  const backup = {format:'inftab-workspace',version:1,exportedAt:'',preferences:{...defaultPreferences,themePalette:'sand'},shortcuts:[],folders:[],launcherOrder:[],todos:[],notes:[],activeNoteId:'',weatherCity:'上海'}
  await page.locator('.home-actions').getByRole('button',{name:'打开设置',exact:true}).click()
  const panel = page.getByRole('dialog',{name:'设置'})
  await panel.getByRole('button',{name:'数据',exact:true}).click()
  await panel.getByRole('button',{name:'打开配置迁移'}).click()
  const migration = panel.locator('.config-migration')
  await migration.getByLabel('选择迁移备份').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
  await migration.getByLabel(/外观与主题/).check()
  await expect(migration.getByRole('button',{name:'执行选择性迁移'})).toBeDisabled()
  await migration.getByLabel('确认替换所选分类').check()
  await migration.getByRole('button',{name:'执行选择性迁移'}).click()
  await expect(migration.getByRole('status')).toContainText('迁移完成')
  await expect(page.locator('html')).toHaveAttribute('data-theme-palette','sand')
  if (before !== null) await expect.poll(()=>page.evaluate(()=>localStorage.getItem('inftab.shortcuts.v1'))).toBe(before)
})
