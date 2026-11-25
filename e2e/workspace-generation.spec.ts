import {expect,test,type Page} from '@playwright/test'
import {build} from 'vite'
import {fileURLToPath} from 'node:url'
import type {GenerationState,GenerationToken} from '../src/data/workspaceGeneration'

let code:string
test.beforeAll(async()=>{
  const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('../src/data/workspaceGeneration.ts',import.meta.url)),formats:['es']}}})
  const output=Array.isArray(result)?result[0]:result
  if(!output||!('output' in output))throw new Error('测试模块构建失败')
  const chunk=output.output.find(item=>item.type==='chunk')
  if(!chunk||chunk.type!=='chunk')throw new Error('缺少测试模块')
  code=chunk.code
})
async function seed(page:Page){
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('generation-seed'))return
    sessionStorage.setItem('generation-seed','1')
    if(!localStorage.getItem('inftab.notes.v1'))localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'generation-note',title:'Original',body:'keep',updatedAt:1}]))
  })
  await page.goto('/')
  await page.locator('.home-actions').getByRole('button',{name:'打开设置',exact:true}).click()
  const panel=page.getByRole('dialog',{name:'设置'})
  await panel.getByRole('button',{name:'数据',exact:true}).click()
  await panel.getByRole('button',{name:'打开存储预检'}).click()
  const preflight=panel.getByRole('group',{name:'本地存储迁移预检'})
  await preflight.getByRole('button',{name:'检查迁移来源'}).click()
  await expect(preflight.getByRole('status')).toContainText('检查完成')
  await preflight.getByRole('button',{name:'保存独立迁移候选'}).click()
  await expect(preflight.getByRole('status')).toContainText('原存储未修改')
}
type Action={kind:'inspect'}|{kind:'prepare';expected:GenerationToken|null;acceptNormalization?:boolean;discardRetiredDraft?:boolean}|{kind:'start'|'retire'|'rollback';token:GenerationToken}|{kind:'commit';token:GenerationToken;content:string;fault?:boolean}
async function run(page:Page,action:Action){
 return page.evaluate(async({code,action})=>{
   const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}))
   const original=IDBObjectStore.prototype.put
   try{
     const engine=await import(url) as typeof import('../src/data/workspaceGeneration')
     if(action.kind==='inspect')return {inspection:await engine.inspectGeneration()}
     if(action.kind==='prepare'){
       const candidate=await new Promise<any>((resolve,reject)=>{
         const req=indexedDB.open('inftab-storage-preflight',1);req.onerror=()=>reject(req.error)
         req.onsuccess=()=>{const db=req.result,r=db.transaction('candidates').objectStore('candidates').get('latest');r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>{db.close();reject(r.error)}}
       })
       return {state:await engine.prepareGeneration(candidate,action.expected,()=>candidate.backup,action.acceptNormalization===true,action.discardRetiredDraft===true)}
     }
     if(action.kind==='commit'&&action.fault)IDBObjectStore.prototype.put=function(value,key){
       if(this.name==='generations')throw new DOMException('Injected generation quota','QuotaExceededError')
       return original.call(this,value,key)
     }
     return {state:await engine.transitionGeneration(action.token,action.kind==='commit'?{kind:'commit',content:action.content}:{kind:action.kind})}
   }catch(e){return {error:(e as Error).message}}
   finally{IDBObjectStore.prototype.put=original;URL.revokeObjectURL(url)}
 },{code,action})
}
function token(s:GenerationState):GenerationToken{return {generation:s.generation,revision:s.revision}}
function edit(state:GenerationState,title:string){
 const backup=JSON.parse(state.head);backup.notes[0].title=title;return JSON.stringify(backup)
}
test('generation initialization, CAS, rollback and retirement preserve legacy bytes',async({page,context})=>{
 await seed(page)
 const raw=await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))
 const refused=await run(page,{kind:'prepare',expected:null});expect(refused.error).toContain('显式确认规范化')
 expect((await run(page,{kind:'inspect'})).inspection?.state).toBeUndefined()
 const prepared=await run(page,{kind:'prepare',expected:null,acceptNormalization:true});expect(prepared.error).toBeUndefined()
 const first=prepared.state!;expect(first.phase).toBe('prepared')
 expect((await run(page,{kind:'commit',token:token(first),content:edit(first,'Not active')})).error).toContain('启动独立演练')
 await page.reload()
 const started=await run(page,{kind:'start',token:token(first)});expect(started.error).toBeUndefined()
 const live=started.state!,other=await context.newPage()
 try{
  await other.goto('/')
  const writes=await Promise.all([run(page,{kind:'commit',token:token(live),content:edit(live,'First')}),run(other,{kind:'commit',token:token(live),content:edit(live,'Second')})])
  expect(writes.filter(x=>x.state)).toHaveLength(1)
  expect(writes.find(x=>x.error)?.error).toContain('版本冲突')
  const saved=writes.find(x=>x.state)!.state!
  const reverted=await run(page,{kind:'rollback',token:token(saved)})
  expect(reverted.state?.head).toBe(live.head)
  const retired=await run(page,{kind:'retire',token:token(reverted.state!)})
  expect(retired.state?.phase).toBe('retired')
  expect((await run(page,{kind:'prepare',expected:token(retired.state!),acceptNormalization:true})).error).toContain('独立草稿')
  const fresh=await run(page,{kind:'prepare',expected:token(retired.state!),acceptNormalization:true,discardRetiredDraft:true})
  expect(fresh.state?.generation).not.toBe(first.generation)
  expect((await run(other,{kind:'start',token:token(first)})).error).toContain('世代或版本冲突')
  expect(await page.evaluate(()=>localStorage.getItem('inftab.notes.v1'))).toBe(raw)
 }finally{await other.close()}
})
test('generation quota, invalid snapshot and legacy drift refuse writes without losing draft',async({page})=>{
 await seed(page)
 const prepared=(await run(page,{kind:'prepare',expected:null,acceptNormalization:true})).state!
 const live=(await run(page,{kind:'start',token:token(prepared)})).state!
 const bad=JSON.parse(live.head);bad.notes.push(bad.notes[0])
 expect((await run(page,{kind:'commit',token:token(live),content:JSON.stringify(bad)})).error).toBeTruthy()
 expect((await run(page,{kind:'commit',token:token(live),content:edit(live,'Quota'),fault:true})).error).toContain('Injected generation quota')
 expect((await run(page,{kind:'inspect'})).inspection?.state).toEqual(live)
 const saved=(await run(page,{kind:'commit',token:token(live),content:edit(live,'Saved draft')})).state!
 await page.evaluate(()=>localStorage.setItem('inftab.notes.v1',JSON.stringify([{id:'generation-note',title:'Legacy writer',body:'keep',updatedAt:2}])))
 const changed=await run(page,{kind:'inspect'});expect(changed.inspection?.sourceChanged).toBe(true)
 expect((await run(page,{kind:'rollback',token:token(saved)})).error).toContain('旧存储修改')
 expect((await run(page,{kind:'inspect'})).inspection?.state).toEqual(saved)
 const stopped=await run(page,{kind:'retire',token:token(saved)})
 expect(stopped.state?.phase).toBe('retired')
 expect(JSON.parse(stopped.state!.head).notes[0].title).toBe('Saved draft')
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inftab.notes.v1')!)[0].title)).toBe('Legacy writer')
})
