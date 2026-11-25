import { createWorkspaceAuthority } from './workspaceAuthority'
import { strictSnapshot } from './workspaceGeneration'
import { planWorkspaceConflict } from './workspaceConflict'
import { same } from './storagePreflight'
import type { WorkspaceBackup } from './backup'
import { parseAuthorityDraft, listRecoveryDrafts } from './authorityRecovery'

/** Async editing session: no fallback, no overwrite on CAS failure. */
export async function openAuthoritySession(sourceOrigin:string){
 const adapter=createWorkspaceAuthority(sourceOrigin),first=await adapter.read()
 if(first.mode!=='active')throw new Error('目标记录未启用或被阻塞，禁止编辑。')
 let token={generation:first.state.generation,revision:first.state.revision}
 let base=first.snapshot,draft=structuredClone(base),busy=false
 const dirty=()=>!same(base,draft)
 const view=()=>({token:{...token},draft:structuredClone(draft),dirty:dirty()})
 function edit(change:(copy:WorkspaceBackup)=>void){
  if(busy)throw new Error('事务正在处理。')
  const next=structuredClone(draft);change(next);draft=next
 }
 async function exclusive<T>(action:()=>Promise<T>){
  if(busy)throw new Error('事务正在处理。')
  busy=true
  try{return await action()}finally{busy=false}
 }
 function save(){return exclusive(async()=>{
  if(!dirty())return view()
  const content=JSON.stringify(draft)
  strictSnapshot(content)
  const next=await adapter.transition(token,{kind:'commit',content})
  token={generation:next.generation,revision:next.revision}
  base=strictSnapshot(next.head);draft=structuredClone(base)
  return view()
 })}
 function rebase(){return exclusive(async()=>{
  const latest=await adapter.read()
  if(latest.mode!=='active'||latest.state.generation!==token.generation)throw new Error('权威世代不可用，保留未提交草稿。')
  const plan=dirty()?planWorkspaceConflict(base,draft,latest.snapshot):{conflicts:[],merged:latest.snapshot}
  if(!plan.merged||plan.conflicts.length)return {conflicts:plan.conflicts}
  base=latest.snapshot;draft=structuredClone(plan.merged)
  // Preserve remote export metadata; it is not a user edit.
  draft.exportedAt=base.exportedAt
  token={generation:latest.state.generation,revision:latest.state.revision}
  return {conflicts:[]}
 })}
 function restore(content:string,recoveryId?:string){return exclusive(async()=>{
  if(dirty())throw new Error('请先保存或导出当前未提交修改。')
  const file=parseAuthorityDraft(content),latest=await adapter.read()
  if(latest.mode!=='active'||file.sourceOrigin!==sourceOrigin||file.generation!==latest.state.generation||file.revision>latest.state.revision)throw new Error('恢复草稿与当前权威世代不匹配。')
  const retained=file.revision===latest.state.revision?latest.state.head:file.revision===latest.state.revision-1?latest.state.previous:undefined
  if(retained!==undefined){
   if(!same(file.base,JSON.parse(retained)))throw new Error('恢复草稿基础快照与保留版本不一致。')
  }else{
   // Only a locally persisted checkpoint may supply an older base.
   if(!recoveryId||!(await listRecoveryDrafts()).some(r=>r.id===recoveryId&&r.content===content))throw new Error('外部草稿基础版本已不在保留范围，请手工合并。')
  }
  token={generation:file.generation,revision:file.revision}
  base=structuredClone(file.base);draft=structuredClone(file.draft)
  return view()
 })}
 const exportDraft=()=>JSON.stringify({format:'inftab-authority-draft',version:1,sourceOrigin,targetOrigin:location.origin,...token,base,draft})
 return {view,edit,save,rebase,restore,exportDraft}
}
