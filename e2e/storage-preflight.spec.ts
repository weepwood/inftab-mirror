import {expect,test,type Page} from '@playwright/test'
async function open(page:Page){
 await page.locator('.home-actions').getByRole('button',{name:'打开设置',exact:true}).click()
 const panel=page.getByRole('dialog',{name:'设置'})
 await panel.getByRole('button',{name:'数据',exact:true}).click()
 await panel.getByRole('button',{name:'打开存储预检'}).click()
 return panel.getByRole('group',{name:'本地存储迁移预检'})
}
async function seed(page:Page){
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('preflight-seeded'))return
  sessionStorage.setItem('preflight-seeded','1')
  if(!localStorage.getItem('inftab.notes.v1'))localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'candidate-note',title:'Original note',body:'Preserve me',updatedAt:1}]))
  localStorage.setItem('inftab.future-unknown.v1','untouched')
 })
 await page.goto('/')
}
async function inspect(panel:Awaited<ReturnType<typeof open>>){
 await panel.getByRole('button',{name:'检查迁移来源'}).click()
 await expect(panel.getByRole('status')).toContainText('检查完成')
}
async function record(page:Page){
 return page.evaluate(()=>new Promise<any>((resolve,reject)=>{
  const r=indexedDB.open('inftab-storage-preflight',1)
  r.onerror=()=>reject(r.error)
  r.onsuccess=()=>{const db=r.result;const req=db.transaction('candidates').objectStore('candidates').get('latest');req.onsuccess=()=>{resolve(req.result);db.close()};req.onerror=()=>{reject(req.error);db.close()}}
 }))
}
test('storage preflight saves isolated raw and logical snapshots and never switches authority',async({page},info)=>{
 await seed(page)
 const panel=await open(page)
 await inspect(panel)
 await expect(panel).toContainText('inftab.future-unknown.v1')
 const before=await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))
 await panel.getByRole('button',{name:'保存独立迁移候选'}).click()
 await expect(panel.getByRole('status')).toContainText('原存储未修改')
 const saved=await record(page)
 expect(saved.source['inftab.notes.v1']).toBe(before)
 expect(saved.backup.notes[0].body).toBe('Preserve me')
 expect(await page.evaluate(()=>localStorage.getItem('inftab.future-unknown.v1'))).toBe('untouched')
 await page.reload()
 const restored=await open(page)
 await expect(restored).toContainText('已保存候选')
 await expect(restored).toContainText('最近检查时与来源一致')
 await info.attach('storage-preflight',{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'})
 page.once('dialog',d=>d.accept())
 await restored.getByRole('button',{name:'删除独立候选'}).click()
 await expect(restored.getByRole('status')).toContainText('原数据保留')
 expect(await record(page)).toBeUndefined()
 expect(await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe(before)
})
test('stale source and competing candidate are refused',async({page,context})=>{
 await seed(page)
 const panel=await open(page);await inspect(panel)
 await page.evaluate(()=>localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'candidate-note',title:'External edit',body:'new',updatedAt:2}])))
 await panel.getByRole('button',{name:'保存独立迁移候选'}).click()
 await expect(panel.getByRole('status')).toContainText('来源数据已变化')
 expect(await record(page)).toBeUndefined()
 await page.reload()
 const first=await open(page);await inspect(first)
 const other=await context.newPage()
 try{
  await other.goto('/')
  const second=await open(other);await inspect(second)
  await first.getByRole('button',{name:'保存独立迁移候选'}).click()
  await expect(first.getByRole('status')).toContainText('原存储未修改')
  const original=await record(page)
  await second.getByRole('button',{name:'保存独立迁移候选'}).click()
  await expect(second.getByRole('status')).toContainText('另一个标签页更新')
  expect((await record(page)).id).toBe(original.id)
 }finally{await other.close()}
})
test('corrupt source JSON and quota failure leave original data intact',async({page})=>{
 await seed(page)
 const panel=await open(page)
 await page.evaluate(()=>localStorage.setItem('inftab.notes.v1','{broken'))
 await panel.getByRole('button',{name:'检查迁移来源'}).click()
 await expect(panel.getByRole('status')).toContainText('损坏的 JSON')
 expect(await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe('{broken')
 await page.evaluate(()=>localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'candidate-note',title:'Original note',body:'Preserve me',updatedAt:1}])))
 await page.reload()
 const again=await open(page);await inspect(again)
 await page.evaluate(()=>{
  const original=IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put=function(value,key){if(this.name==='candidates')throw new DOMException('Injected migration quota','QuotaExceededError');return original.call(this,value,key)}
 })
 await again.getByRole('button',{name:'保存独立迁移候选'}).click()
 await expect(again.getByRole('status')).toContainText('Injected migration quota')
 expect(await record(page)).toBeUndefined()
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.notes.v1')!)[0].body)).toBe('Preserve me')
})

test('pending desktop transaction blocks migration staging',async({page})=>{
 await seed(page)
 const panel=await open(page);await inspect(panel)
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const req=indexedDB.open('inftab-desktop-transactions',1)
  req.onerror=()=>reject(req.error)
  req.onsuccess=()=>{
   const db=req.result,tx=db.transaction('intents','readwrite')
   const keys=['inftab.shortcuts.v1','inftab.folders.v1','inftab.launcher-order.v1','inftab.home-workspaces.v1']
   const raw=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))
   tx.objectStore('intents').put({id:'pending-test',createdAt:Date.now(),before:raw,after:raw},'pending')
   tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error)}
  }
 }))
 await panel.getByRole('button',{name:'保存独立迁移候选'}).click()
 await expect(panel.getByRole('status')).toContainText('存在未完成的桌面事务')
 expect(await record(page)).toBeUndefined()
 await panel.getByRole('button',{name:'检查迁移来源'}).click()
 await expect(panel.getByRole('status')).toContainText('存在未完成的桌面事务')
})
