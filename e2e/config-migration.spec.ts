import { expect, test } from '@playwright/test'
test('selective migration preserves entries and creates a recovery point', async ({page}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('inftab.shortcuts.v1')) localStorage.setItem('inftab.shortcuts.v1', JSON.stringify([{id:'migration-local',title:'Local entry',url:'https://local.example/',color:'#abc',mark:'L'}]))
  })
  await page.goto('/')
  await expect(page.getByRole('button',{name:'打开Local entry'})).toBeVisible()
  const backup = {format:'inftab-workspace',version:1,exportedAt:'',preferences:{engine:'baidu',mode:'html',wallpaper:'wallpapers/forest.webp',customWallpaper:'',shade:.24,iconSize:72,columns:6,showNames:true,iconRadius:22,themePalette:'sand'},shortcuts:[],folders:[],launcherOrder:[],todos:[],notes:[],activeNoteId:'',weatherCity:'上海'}
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
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.shortcuts.v1')??'[]').map((item:{id:string})=>item.id))).toEqual(['migration-local'])
  await expect.poll(()=>page.evaluate(()=>new Promise<boolean>((resolve,reject)=>{
    const request = indexedDB.open('inftab-backup-history')
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{
      const db=request.result
      const records=db.transaction('snapshots').objectStore('snapshots').getAll()
      records.onsuccess=()=>{resolve(records.result.some(item=>item.reason==='before-change' && JSON.parse(item.content).shortcuts.some((entry:{id:string})=>entry.id==='migration-local')));db.close()}
      records.onerror=()=>{reject(records.error);db.close()}
    }
  }))).toBe(true)
})
