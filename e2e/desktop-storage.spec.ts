import {expect,test} from '@playwright/test'
test('desktop mutations refuse a cooperating tab lock and persist before reporting success',async({page,context})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('inftab.desktop-mode.v1','true')
  localStorage.setItem('inftab.shortcuts.v1',JSON.stringify([{id:'lock-link',title:'Lock link',url:'https://example.com',mark:'L',color:'#5689aa'}]))
  localStorage.setItem('inftab.folders.v1',JSON.stringify([{id:'lock-folder',title:'Lock folder',shortcutIds:[],mark:'F',color:'#4176e8'}]))
  localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([{id:'default',name:'主页',itemIds:['lock-link','lock-folder']}]))
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Finder',exact:true}).click()
 const finder=page.getByRole('dialog',{name:'Finder 入口管理'})
 await finder.locator('[data-finder-id="lock-link"]').click()
 const other=await context.newPage()
 try{
  await other.goto('/')
  await other.evaluate(()=>{
   void navigator.locks.request('inftab-desktop-mutation-v1',async()=>{
    await new Promise<void>(resolve=>window.addEventListener('release-test-lock',()=>resolve(),{once:true}))
   })
  })
  await expect.poll(()=>other.evaluate(async()=>Boolean((await navigator.locks.query()).held?.some(l=>l.name==='inftab-desktop-mutation-v1')))).toBe(true)
  await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('lock-folder')
  await expect(page.getByRole('alert').filter({hasText:'另一个标签页正在执行桌面操作'})).toBeVisible()
  await expect(finder.locator('[data-finder-id="lock-link"]')).toBeVisible()
  await other.evaluate(()=>window.dispatchEvent(new Event('release-test-lock')))
  await expect.poll(()=>other.evaluate(async()=>Boolean((await navigator.locks.query()).held?.some(l=>l.name==='inftab-desktop-mutation-v1')))).toBe(false)
  await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('lock-folder')
  await expect(finder.getByRole('button',{name:'撤销操作'})).toBeEnabled()
  expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('inftab.folders.v1')??'[]')[0]?.shortcutIds)).toEqual(['lock-link'])
 }finally{await other.close()}
})

for(const direction of ['完成写入','回退事务','conflict'] as const){
 test('persistent desktop intent survives reload and handles '+direction,async({page})=>{
  await page.addInitScript(()=>{
   if(sessionStorage.getItem('intent-seeded'))return
   sessionStorage.setItem('intent-seeded','1')
   localStorage.setItem('inftab.desktop-mode.v1','true')
   localStorage.setItem('inftab.shortcuts.v1',JSON.stringify([{id:'intent-link',title:'Intent link',url:'https://example.com/',mark:'I',color:'#5689aa'}]))
   localStorage.setItem('inftab.folders.v1',JSON.stringify([{id:'intent-folder',title:'Intent folder',shortcutIds:[],mark:'F',color:'#4176e8'}]))
   localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([{id:'default',name:'主页',itemIds:['intent-link','intent-folder']}]))
   localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'intent-note',title:'Untouched note',body:'keep',updatedAt:1}]))
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Finder',exact:true}).click()
  const finder=page.getByRole('dialog',{name:'Finder 入口管理'})
  await finder.locator('[data-finder-id="intent-link"]').click()
  await page.evaluate(()=>{
   const original=Storage.prototype.setItem
   Storage.prototype.setItem=function(key,value){
    if(key==='inftab.folders.v1'&&value.includes('intent-link'))throw new DOMException('Injected interrupted write','QuotaExceededError')
    original.call(this,key,value)
   }
  })
  await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('intent-folder')
  await expect(page.getByRole('alert').filter({hasText:'部分数据写入失败'})).toBeVisible()
  const recovery=page.getByRole('region',{name:'桌面事务恢复'})
  await expect(recovery).toBeVisible()
  if(direction==='conflict'){
   await page.evaluate(()=>{
    const key='inftab.shortcuts.v1',items=JSON.parse(localStorage.getItem(key)??'[]')
    items[0].title='External edit after interruption';localStorage.setItem(key,JSON.stringify(items))
   })
  }
  await page.reload()
  await expect(recovery).toBeVisible()
  if(direction==='conflict'){
   await expect(recovery.getByRole('button',{name:'完成写入'})).toBeDisabled()
   await expect(recovery.getByRole('button',{name:'回退事务'})).toBeDisabled()
   await expect(recovery).toContainText('检测到其他修改')
   page.once('dialog',dialog=>dialog.accept())
   await Promise.all([page.waitForEvent('load'),recovery.getByRole('button',{name:'保留当前数据'}).click()])
   await expect(recovery).toHaveCount(0)
   expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.shortcuts.v1')??'[]')[0]?.title)).toBe('External edit after interruption')
   return
  }
  await expect(recovery.getByRole('button',{name:direction})).toBeEnabled()
  page.once('dialog',dialog=>dialog.accept())
  await Promise.all([page.waitForEvent('load'),recovery.getByRole('button',{name:direction}).click()])
  await expect(recovery).toHaveCount(0)
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.folders.v1')??'[]')[0]?.shortcutIds)).toEqual(direction==='完成写入'?['intent-link']:[])
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.notes.v1')??'[]')[0]?.body)).toBe('keep')
 })
}

test('desktop intent write failure prevents all launcher mutations',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('inftab.desktop-mode.v1','true')
  localStorage.setItem('inftab.shortcuts.v1',JSON.stringify([{id:'abort-link',title:'Abort link',url:'https://example.com/',mark:'A',color:'#5689aa'}]))
  localStorage.setItem('inftab.folders.v1',JSON.stringify([{id:'abort-folder',title:'Abort folder',shortcutIds:[],mark:'F',color:'#4176e8'}]))
  localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([{id:'default',name:'主页',itemIds:['abort-link','abort-folder']}]))
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Finder',exact:true}).click()
 const finder=page.getByRole('dialog',{name:'Finder 入口管理'})
 await finder.locator('[data-finder-id="abort-link"]').click()
 await page.evaluate(()=>{
  const original=IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put=function(value,key){
   if(this.name==='intents'&&key==='pending')throw new DOMException('Injected intent write failure','QuotaExceededError')
   return original.call(this,value,key)
  }
 })
 await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('abort-folder')
 await expect(page.getByRole('alert').filter({hasText:'Injected intent write failure'})).toBeVisible()
 await expect(finder.locator('[data-finder-id="abort-link"]')).toBeVisible()
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.folders.v1')??'[]')[0]?.shortcutIds)).toEqual([])
 await expect(page.getByRole('region',{name:'桌面事务恢复'})).toHaveCount(0)
})
