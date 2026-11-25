import type { Ref } from 'vue'
import type { Shortcut, ShortcutFolder } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { WorkspaceBackup } from '../data/backup'
import { flushStoredState } from '../composables/useStoredState'
import { captureHistory } from '../data/backupHistory'
import { OperationHistory } from './operationHistory'
import { createLocalId } from '../data/createId'
import { planWorkspaceMove,planFolderMembership,planPaste,planFolderNesting,type DesktopMutation } from './ownership'

type MutationState={workspaces:Ref<HomeWorkspace[]>;folders:Ref<ShortcutFolder[]>;shortcuts:Ref<Shortcut[]>;launcherOrder:Ref<string[]>;addShortcuts:(items:Shortcut[],workspaceId:string)=>boolean;createBackup:()=>WorkspaceBackup}
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
 state.shortcuts.value=next.shortcuts
 state.folders.value=next.folders
 state.launcherOrder.value=next.launcherOrder
 state.workspaces.value=next.workspaces
}
function prepare(action:Exclude<DesktopMutation,{kind:'undo'|'redo'}>,state:MutationState):(()=>string|undefined)|string{
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
   if(!state.addShortcuts(copies,action.workspaceId))return '复制失败：入口数量达到上限或数据无效。'
   state.folders.value=next.folders
  }else{state.folders.value=next.folders;state.workspaces.value=next.workspaces}
  return undefined
 }
}
let busy=false
/** Preserve the pre-change recovery point before committing multi-key changes.
 * This is a guarded localStorage operation, not a multi-key database transaction.
 */
async function guardedMutation(action:DesktopMutation,state:MutationState):Promise<string|undefined>{
 if(busy)return '另一个桌面操作正在保存，请稍后重试。'
 busy=true
 try{
  const before=domain(state)
  const plan=action.kind==='undo'||action.kind==='redo'?history.plan(action.kind,before):undefined
  if(plan&&'error' in plan)return plan.error
  const apply=plan&&'value' in plan?()=>{applyDomain(state,plan.value);return undefined}:prepare(action as Exclude<DesktopMutation,{kind:'undo'|'redo'}>,state)
  if(typeof apply==='string')return apply
  const cells=[state.shortcuts,state.folders,state.launcherOrder,state.workspaces]
  if(cells.map(flushStoredState).some(ok=>!ok))return '现有入口数据尚未保存，请先处理存储错误。'
  const keys=['inftab.shortcuts.v1','inftab.folders.v1','inftab.launcher-order.v1','inftab.home-workspaces.v1']
  const fingerprint=()=>JSON.stringify(keys.map(key=>localStorage.getItem(key)))
  const snapshot=state.createBackup(),expected=signature(snapshot),stored=fingerprint()
  await captureHistory(snapshot,'before-change')
  if(signature(state.createBackup())!==expected||fingerprint()!==stored)return '备份期间数据已变化，请重新操作。'
  const error=apply()
  if(error)return error
  if(cells.map(flushStoredState).some(ok=>!ok))return '桌面操作已修改内存，但部分数据写入失败。请勿关闭页面，可在设置中使用操作前恢复点。'
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
