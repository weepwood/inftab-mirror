import { createWorkspaceAuthority } from './workspaceAuthority'
import { strictSnapshot } from './workspaceGeneration'
import { planWorkspaceConflict } from './workspaceConflict'
import { same } from './storagePreflight'
import type { WorkspaceBackup } from './backup'

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
 const exportDraft=()=>JSON.stringify({format:'inftab-authority-draft',version:1,sourceOrigin,targetOrigin:location.origin,...token,base,draft})
 return {view,edit,save,rebase,exportDraft}
}
