import type { Ref } from 'vue'
import type { Shortcut, ShortcutFolder } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { WorkspaceBackup } from '../data/backup'
import { flushStoredState, discardStoredWrite } from '../composables/useStoredState'
import { captureHistory } from '../data/backupHistory'
import { OperationHistory } from './operationHistory'
import { sanitizeLauncherOrder, sanitizeShortcuts, sanitizeFolders } from '../data/sanitize'
import { beginIntent,finishIntent,readIntent,readTransactionValues,replayIntent,canReplay,transactionKeys,type TransactionValues } from './transactionIntent'
import { createLocalId } from '../data/createId'
import { planWorkspaceMove,planFolderMembership,planPaste,planFolderNesting,type DesktopMutation } from './ownership'

type MutationState={workspaces:Ref<HomeWorkspace[]>;folders:Ref<ShortcutFolder[]>;shortcuts:Ref<Shortcut[]>;launcherOrder:Ref<string[]>;createBackup:()=>WorkspaceBackup}
const signature=(snapshot:WorkspaceBackup)=>JSON.stringify({...snapshot,exportedAt:''})
type Domain = {shortcuts:Shortcut[];folders:ShortcutFolder[];workspaces:HomeWorkspace[];launcherOrder:string[];dockItemIds:string[]}
const domainSignature=(domain:Domain)=>JSON.stringify(domain)
const history=new OperationHistory<Domain>(domainSignature)
export const desktopHistoryAvailability=()=>history.available()
function domain(state:MutationState):Domain{
 const snapshot=state.createBackup()
 return {shortcuts:snapshot.shortcuts,folders:snapshot.folders,workspaces:snapshot.homeWorkspaces??[],launcherOrder:snapshot.launcherOrder,dockItemIds:snapshot.preferences.dockItemIds}
}
function applyDomain(state:MutationState,next:Domain){
 // All refs are from the existing launcher store. Never restore unrelated notes or preferences.
 next=JSON.parse(JSON.stringify(next)) as Domain
 if(JSON.stringify(state.shortcuts.value)!==JSON.stringify(next.shortcuts))state.shortcuts.value=next.shortcuts
 if(JSON.stringify(state.folders.value)!==JSON.stringify(next.folders))state.folders.value=next.folders
 if(JSON.stringify(state.launcherOrder.value)!==JSON.stringify(next.launcherOrder))state.launcherOrder.value=next.launcherOrder
 if(JSON.stringify(state.workspaces.value)!==JSON.stringify(next.workspaces))state.workspaces.value=next.workspaces
}
function prepare(action:Exclude<DesktopMutation,{kind:'undo'|'redo'}|{kind:'recover'}>,state:MutationState):(()=>string|undefined)|string{
 const input={workspaces:state.workspaces.value,folders:state.folders.value,shortcutIds:state.shortcuts.value.map(s=>s.id)}
 if(action.kind==='reparent'){
  const next=planFolderNesting(input,action.ids,action.workspaceId,action.folderId)
  if(!next)return '无法移动文件夹：目标无效、跨工作区、循环引用或层级过深。'
  return ()=>{state.folders.value=next;return undefined}
 }
 if(action.kind==='membership'){
  const next=planFolderMembership(input,action.ids,action.folderId)
  if(!next)return '入口或文件夹归属已变化，请重新选择。'
  return ()=>{state.folders.value=next;return undefined}
 }
 if(action.kind==='move'){
  const next=planWorkspaceMove(input,action.ids,action.workspaceId)
  if(!next)return '入口或工作区已变化，无法完成移动，请重新选择。'
  return ()=>{state.folders.value=next.folders;state.workspaces.value=next.workspaces;return undefined}
 }
 const copy=action.clipboard.mode==='copy'
 const copies=copy?action.clipboard.ids.flatMap(id=>{
  const item=state.shortcuts.value.find(s=>s.id===id)
  return item?[{...item,id:createLocalId()}]:[]
 }):[]
 const next=planPaste(input,action.clipboard,action.workspaceId,action.folderId,copies.map(s=>s.id))
 if(!next)return '剪贴板来源或目标已变化，请重新选择。'
 if(copy&&state.shortcuts.value.length+copies.length>500)return '复制失败：入口数量达到上限。'
 return ()=>{
  if(copy){
   const items=sanitizeShortcuts([...state.shortcuts.value,...copies])
   if(items.length!==state.shortcuts.value.length+copies.length)return '复制失败：入口数量达到上限或数据无效。'
   state.shortcuts.value=items
   state.folders.value=next.folders
   state.workspaces.value=next.workspaces
   state.launcherOrder.value=sanitizeLauncherOrder([...state.launcherOrder.value,...copies.map(i=>i.id)],items,next.folders)
  }else{state.folders.value=next.folders;state.workspaces.value=next.workspaces}
  return undefined
 }
}
let busy=false
/** Stage changes, record a durable recovery intent, then persist the compatible v1 keys.
 * IndexedDB protects the intent, not the independent localStorage writes.
 */
async function guardedMutation(action:DesktopMutation,state:MutationState):Promise<string|undefined>{
 if(busy)return '另一个桌面操作正在保存，请稍后重试。'
 busy=true
 try{
  const pending=await readIntent()
  if(action.kind==='recover'){
   if(!pending||pending.id!==action.id)return '事务记录已变化，请重新检查。'
   const cells=[state.shortcuts,state.folders,state.launcherOrder,state.workspaces]
   if(action.direction==='keep'){
    await finishIntent(pending.id)
    cells.forEach(discardStoredWrite)
    location.reload()
    return
   }
   if(!canReplay(pending,readTransactionValues()))return '事务后存在其他数据修改，无法安全恢复，请先导出备份。'
   // User explicitly selected recovery and reload. Cancel stale pending writes
   // only for the four journaled keys, never for notes/preferences or other tools.
   try{replayIntent(pending,action.direction)}
   finally{cells.forEach(discardStoredWrite)}
   await finishIntent(pending.id)
   cells.forEach(discardStoredWrite)
   location.reload()
   return
  }
  if(pending)return '有未完成的桌面事务，请先恢复。'
  const before=domain(state)
  const plan=action.kind==='undo'||action.kind==='redo'?history.plan(action.kind,before):undefined
  if(plan&&'error' in plan)return plan.error
  const staged={...state,shortcuts:{value:before.shortcuts} as Ref<Shortcut[]>,folders:{value:before.folders} as Ref<ShortcutFolder[]>,launcherOrder:{value:before.launcherOrder} as Ref<string[]>,workspaces:{value:before.workspaces} as Ref<HomeWorkspace[]>}
  const apply=plan&&'value' in plan?()=>{applyDomain(staged,plan.value);return undefined}:prepare(action as Exclude<DesktopMutation,{kind:'undo'|'redo'}|{kind:'recover'}>,staged)
  if(typeof apply==='string')return apply
  const stageError=apply()
  if(stageError)return stageError
  const next:Domain={shortcuts:staged.shortcuts.value,folders:sanitizeFolders(staged.folders.value,staged.shortcuts.value),workspaces:staged.workspaces.value,launcherOrder:[],dockItemIds:before.dockItemIds}
  next.launcherOrder=sanitizeLauncherOrder(staged.launcherOrder.value,next.shortcuts,next.folders)
  if(domainSignature(before)===domainSignature(next))return
  if(before.dockItemIds.some(id=>before.shortcuts.some(s=>s.id===id)&&!next.shortcuts.some(s=>s.id===id)))return '操作会移除 Dock 正在使用的入口，请先调整 Dock。'
  const cells=[state.shortcuts,state.folders,state.launcherOrder,state.workspaces]
  if(cells.map(flushStoredState).some(ok=>!ok))return '现有入口数据尚未保存，请先处理存储错误。'
  const fingerprint=()=>JSON.stringify(readTransactionValues())
  const snapshot=state.createBackup(),expected=signature(snapshot),stored=fingerprint()
  await captureHistory(snapshot,'before-change')
  if(signature(state.createBackup())!==expected||fingerprint()!==stored)return '备份期间数据已变化，请重新操作。'
  const rawBefore=readTransactionValues()
  const values=[next.shortcuts,next.folders,next.launcherOrder,next.workspaces]
  const oldValues=[before.shortcuts,before.folders,before.launcherOrder,before.workspaces]
  const rawAfter=Object.fromEntries(transactionKeys.map((key,index)=>[key,JSON.stringify(values[index])===JSON.stringify(oldValues[index])?rawBefore[key]:JSON.stringify(values[index])])) as TransactionValues
  const intent=await beginIntent(rawBefore,rawAfter)
  if(signature(state.createBackup())!==expected||fingerprint()!==stored){await finishIntent(intent.id);return '事务准备期间数据已变化，请重新操作。'}
  applyDomain(state,next)
  const flushed=cells.map(flushStoredState).every(Boolean)
  if(!flushed||JSON.stringify(readTransactionValues())!==JSON.stringify(rawAfter))return '桌面操作已修改内存，但部分数据写入失败。请使用桌面事务恢复或设置中的恢复点。'
  await finishIntent(intent.id)
  if(plan&&'complete' in plan)plan.complete()
  else history.record(before,domain(state))
  return undefined
 }catch(error){return '桌面操作已停止：'+(error instanceof Error?error.message:'无法保存恢复点。')}
 finally{busy=false}
}
export async function applyDesktopMutation(action:DesktopMutation,state:MutationState):Promise<string|undefined>{
 // Serialize cooperating desktop tabs when Web Locks is available. Older engines retain
 // the snapshot check; legacy writes still use independent localStorage keys.
 if(typeof navigator!=='undefined'&&navigator.locks?.request){
  return navigator.locks.request('inftab-desktop-mutation-v1',{ifAvailable:true},lock=>lock?guardedMutation(action,state):'另一个标签页正在执行桌面操作，请重试。')
 }
 return guardedMutation(action,state)
}
