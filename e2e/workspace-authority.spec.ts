import {expect,test,type Page} from '@playwright/test'
import {build} from 'vite'
import {fileURLToPath} from 'node:url'
import {readFile} from 'node:fs/promises'
import type {AuthorityState} from '../src/data/workspaceAuthority'
import type {MigrationCandidate} from '../src/data/storagePreflight'
import type {GenerationToken} from '../src/data/workspaceGeneration'

let code:string
test.beforeAll(async()=>{
 const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('../src/data/workspaceAuthority.ts',import.meta.url)),formats:['es']}}})
 const output=Array.isArray(result)?result[0]:result
 if(!output||!('output' in output))throw new Error('测试模块构建失败')
 const chunk=output.output.find(item=>item.type==='chunk')
 if(!chunk||chunk.type!=='chunk')throw new Error('缺少测试模块')
 code=chunk.code
})
async function source(page:Page){
 await page.addInitScript(()=>{
  if(location.hostname==='127.0.0.1'&&!sessionStorage.getItem('authority-source-seeded')){sessionStorage.setItem('authority-source-seeded','1');localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'authority-note',title:'Source',body:'keep',updatedAt:1}]));localStorage.setItem('inftab.todos.v1',JSON.stringify([{id:'authority-todo',title:'Test todo',done:false}]))}
 })
 await page.goto('/')
 await page.locator('.home-actions').getByRole('button',{name:'打开设置',exact:true}).click()
 const settings=page.getByRole('dialog',{name:'设置'})
 await settings.getByRole('button',{name:'数据',exact:true}).click()
 await settings.getByRole('button',{name:'打开存储预检'}).click()
 const panel=settings.getByRole('group',{name:'本地存储迁移预检'})
 await panel.getByRole('button',{name:'检查迁移来源'}).click()
 await expect(panel.getByRole('status')).toContainText('检查完成')
 await panel.getByRole('button',{name:'保存独立迁移候选'}).click()
 await expect(panel.getByRole('status')).toContainText('原存储未修改')
 return page.evaluate(()=>new Promise<MigrationCandidate>((resolve,reject)=>{
  const request=indexedDB.open('inftab-storage-preflight',1)
  request.onerror=()=>reject(request.error)
  request.onsuccess=()=>{
   const db=request.result,r=db.transaction('candidates').objectStore('candidates').get('latest')
   r.onsuccess=()=>{db.close();resolve(r.result)}
   r.onerror=()=>{db.close();reject(r.error)}
  }
 }))
}
async function target(page:Page){
 await page.route('https://authority.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated authority test</title>'}))
 await page.goto('https://authority.test/')
}
type Action={kind:'read'}|{kind:'prepare';candidate:MigrationCandidate;fault?:boolean}|{kind:'activate'|'rollback'|'archive';token:GenerationToken}|{kind:'commit';token:GenerationToken;content:string;fault?:boolean}
async function run(page:Page,origin:string,action:Action){
 return page.evaluate(async({code,origin,action})=>{
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}))
  const original=IDBObjectStore.prototype.put
  try{
   const {createWorkspaceAuthority}=await import(url) as typeof import('../src/data/workspaceAuthority')
   const adapter=createWorkspaceAuthority(origin)
   if('fault' in action&&action.fault)IDBObjectStore.prototype.put=function(value,key){
    const req=original.call(this,value,key)
    if(this.name==='workspace')throw new DOMException('Injected authority quota','QuotaExceededError')
    return req
   }
   if(action.kind==='read')return {read:await adapter.read()}
   if(action.kind==='prepare')return {state:await adapter.prepare(action.candidate,true)}
   return {state:await adapter.transition(action.token,action.kind==='commit'?{kind:'commit',content:action.content}:{kind:action.kind})}
  }catch(error){return {error:(error as Error).message}}
  finally{IDBObjectStore.prototype.put=original;URL.revokeObjectURL(url)}
 },{code,origin,action})
}
const token=(state:AuthorityState)=>({generation:state.generation,revision:state.revision})
function edit(state:AuthorityState,title:string){
 const backup=JSON.parse(state.head);backup.notes[0].title=title;return JSON.stringify(backup)
}
test('isolated authority imports explicitly, resumes prepared state and commits atomically across tabs',async({page,context})=>{
 const candidate=await source(page),origin=new URL(page.url()).origin
 const raw=await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))
 expect((await run(page,origin,{kind:'read'})).error).toContain('独立 origin')
 const a=await context.newPage(),b=await context.newPage()
 try{
  await target(a);await target(b)
  expect((await run(a,origin,{kind:'read'})).read?.mode).toBe('uninitialized')
  expect((await run(a,origin,{kind:'prepare',candidate,fault:true})).error).toContain('Injected authority quota')
  expect((await run(a,origin,{kind:'read'})).read?.mode).toBe('uninitialized')
  const result=await run(a,origin,{kind:'prepare',candidate});expect(result.error).toBeUndefined()
  const prepared=result.state!
  expect((await run(b,origin,{kind:'prepare',candidate})).error).toContain('不允许重新初始化')
  await a.reload()
  expect((await run(a,origin,{kind:'read'})).read?.mode).toBe('prepared')
  expect((await run(a,origin,{kind:'commit',token:token(prepared),content:edit(prepared,'Premature')})).error).toContain('尚未启用')
  const active=(await run(b,origin,{kind:'activate',token:token(prepared)})).state!
  const commits=await Promise.all([run(a,origin,{kind:'commit',token:token(active),content:edit(active,'A')}),run(b,origin,{kind:'commit',token:token(active),content:edit(active,'B')})])
  expect(commits.filter(x=>x.state)).toHaveLength(1)
  expect(commits.find(x=>x.error)?.error).toContain('版本冲突')
  const winner=commits.find(x=>x.state)!.state!
  expect((await run(a,origin,{kind:'commit',token:token(winner),content:edit(winner,'Quota'),fault:true})).error).toContain('Injected authority quota')
  expect((await run(b,origin,{kind:'read'})).read?.state).toEqual(winner)
  const reverted=(await run(b,origin,{kind:'rollback',token:token(winner)})).state!
  expect(reverted.head).toBe(active.head)
  expect(reverted.revision).toBe(winner.revision+1)
  expect(await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe(raw)
  expect(await a.evaluate(()=>localStorage.length)).toBe(0)
 }finally{await a.close();await b.close()}
})
test('legacy data on the target fails closed, retaining authority data for export',async({page,context})=>{
 const candidate=await source(page),origin=new URL(page.url()).origin
 const other=await context.newPage()
 try{
  await target(other)
  await other.evaluate(()=>localStorage.setItem('inftab.future-unknown.v1','legacy'))
  expect((await run(other,origin,{kind:'read'})).read?.mode).toBe('blocked')
  expect((await run(other,origin,{kind:'prepare',candidate})).error).toContain('禁止权威写入')
  await other.evaluate(()=>localStorage.removeItem('inftab.future-unknown.v1'))
  const prepared=(await run(other,origin,{kind:'prepare',candidate})).state!
  const active=(await run(other,origin,{kind:'activate',token:token(prepared)})).state!
  await other.evaluate(()=>localStorage.setItem('inftab.notes.v1','legacy bytes'))
  const blocked=await run(other,origin,{kind:'read'})
  expect(blocked.read?.mode).toBe('blocked')
  expect(blocked.read?.state).toEqual(active)
  expect((await run(other,origin,{kind:'commit',token:token(active),content:edit(active,'Overwrite')})).error).toContain('禁止权威写入')
  expect(await other.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe('legacy bytes')
  const archived=(await run(other,origin,{kind:'archive',token:token(active)})).state!
  expect(archived.head).toBe(active.head)
  expect(archived.phase).toBe('archived')
  await other.evaluate(()=>localStorage.removeItem('inftab.notes.v1'))
  expect((await run(other,origin,{kind:'read'})).read?.mode).toBe('archived')
  expect((await run(other,origin,{kind:'activate',token:token(archived)})).error).toContain('已归档')
 }finally{await other.close()}
})

test('actual migration console transfers checked files across origins without modifying source',async({page,context},info)=>{
 const candidate=await source(page),origin=new URL(page.url()).origin
 const original=await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))
 const result=await build({configFile:fileURLToPath(new URL('../vite.migration.config.ts',import.meta.url)),logLevel:'error',build:{write:false}})
 const output=Array.isArray(result)?result[0]:result
 if(!output||!('output' in output))throw new Error('迁移控制台构建失败')
 async function consoleAt(tab:Page,base:string){
  await tab.route(base+'/__migration/**',route=>{
   const name=new URL(route.request().url()).pathname.slice('/__migration/'.length)||'index.html'
   const asset=output.output.find(item=>item.fileName===name)
   if(!asset)return route.fulfill({status:404})
   return route.fulfill({status:200,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:asset.type==='chunk'?asset.code:typeof asset.source==='string'?asset.source:Buffer.from(asset.source)})
  })
  await tab.goto(base+'/__migration/')
 }
 const destination='https://authority.test',other=await context.newPage()
 try{
  await consoleAt(page,origin)
  await page.getByLabel('目标 Origin').fill(destination)
  const dl=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载迁移文件'}).click()]).then(([d])=>d)
  const bytes=await readFile((await dl.path())!)
  const exported=JSON.parse(bytes.toString())
  expect(exported.candidate).toEqual(candidate)
  expect(exported.sourceOrigin).toBe(origin)
  await consoleAt(other,destination)
  await other.getByLabel('来源 Origin').fill(origin)
  const upload=(data:Buffer)=>other.getByLabel('选择迁移文件').setInputFiles({name:'migration.json',mimeType:'application/json',buffer:data})
  const tampered=structuredClone(exported);tampered.candidate.backup.notes[0].title='Tampered'
  await upload(Buffer.from(JSON.stringify(tampered)))
  await expect(other.getByRole('status')).toContainText('SHA256 校验失败')
  await expect(other.getByRole('button',{name:'确认初始化'})).toBeDisabled()
  const wrong=structuredClone(exported);wrong.targetOrigin='https://wrong.test'
  await upload(Buffer.from(JSON.stringify(wrong)))
  await expect(other.getByRole('status')).toContainText('来源/目标不匹配')
  await upload(bytes)
  await expect(other.getByRole('status')).toContainText('检查通过')
  await info.attach('migration-transfer-preview',{body:await other.screenshot({animations:'disabled'}),contentType:'image/png'})
  other.once('dialog',d=>d.accept())
  await other.getByRole('button',{name:'确认初始化'}).click()
  await expect(other.getByRole('status')).toContainText('目标记录已准备')
  await other.reload()
  await other.getByLabel('来源 Origin').fill(origin)
  await other.getByRole('button',{name:'读取目标记录'}).click()
  await expect(other.locator('#state')).toContainText('prepared · Revision 1')
  other.once('dialog',d=>d.accept())
  await other.getByRole('button',{name:'启用独立记录'}).click()
  await expect(other.locator('#state')).toContainText('active · Revision 2')
  await upload(bytes)
  await expect(other.getByRole('status')).toContainText('检查通过')
  other.once('dialog',d=>d.accept())
  await other.getByRole('button',{name:'确认初始化'}).click()
  await expect(other.getByRole('status')).toContainText('不允许重新初始化')
  const second=await context.newPage()
  try{
   await consoleAt(second,destination)
   await second.getByLabel('来源 Origin').fill(origin)
   await second.getByRole('button',{name:'读取目标记录'}).click()
   await second.getByRole('button',{name:'打开权威工作区编辑'}).click()
   await other.getByRole('button',{name:'读取目标记录'}).click()
   await other.getByRole('button',{name:'打开权威工作区编辑'}).click()
   await other.getByLabel('笔记标题').fill('Saved title')
   await second.getByRole('checkbox',{name:'Test todo'}).check()
   await other.getByRole('button',{name:'保存权威修改'}).click()
   await expect(other.getByRole('status')).toContainText('权威快照已提交')
   await second.getByRole('button',{name:'保存权威修改'}).click()
   await expect(second.getByRole('status')).toContainText('版本冲突')
   await expect(second.getByRole('checkbox',{name:'Test todo'})).toBeChecked()
   await second.getByRole('button',{name:'读取并合并最新版本'}).click()
   await expect(second.getByLabel('笔记标题')).toHaveValue('Saved title')
   await expect(second.getByRole('checkbox',{name:'Test todo'})).toBeChecked()
   await second.getByRole('button',{name:'保存权威修改'}).click()
   await expect(second.getByRole('status')).toContainText('权威快照已提交')
   await other.getByRole('button',{name:'读取并合并最新版本'}).click()
   await expect(other.getByRole('checkbox',{name:'Test todo'})).toBeChecked()
   await other.getByLabel('笔记标题').fill('Conflicting local')
   await second.getByLabel('笔记标题').fill('Conflicting remote')
   await second.getByRole('button',{name:'保存权威修改'}).click()
   await expect(second.getByRole('status')).toContainText('权威快照已提交')
   await other.getByRole('button',{name:'读取并合并最新版本'}).click()
   await expect(other.getByRole('status')).toContainText('存在冲突')
   await expect(other.getByLabel('笔记标题')).toHaveValue('Conflicting local')
   const draftFile=await Promise.all([other.waitForEvent('download'),other.getByRole('button',{name:'导出未提交草稿'}).click()]).then(([d])=>d)
   const draft=JSON.parse(await readFile((await draftFile.path())!,'utf8'))
   expect(draft.draft.notes[0].title).toBe('Conflicting local')
   expect(draft.base.notes[0].title).toBe('Saved title')
   await info.attach('authority-editor',{body:await other.screenshot({animations:'disabled'}),contentType:'image/png'})
   other.once('dialog',d=>d.accept())
   await other.getByRole('button',{name:'关闭编辑会话'}).click()
   await expect(other.locator('#authority-editor')).toBeHidden()
  }finally{await second.close()}
  expect(await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe(original)
  await page.evaluate(()=>localStorage.setItem('inftab.notes.v1','changed'))
  await page.getByRole('button',{name:'下载迁移文件'}).click()
  await expect(page.getByRole('status')).toContainText('来源数据已变化')
 }finally{await other.close()}
})
