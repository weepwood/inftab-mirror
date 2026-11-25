import type { Ref } from 'vue'
import type { Shortcut, ShortcutFolder } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { WorkspaceBackup } from '../data/backup'
import { captureHistory } from '../data/backupHistory'
import { createLocalId } from '../data/createId'
import { planWorkspaceMove,planFolderMembership,planPaste,type DesktopMutation } from './ownership'

type MutationState={workspaces:Ref<HomeWorkspace[]>;folders:Ref<ShortcutFolder[]>;shortcuts:Ref<Shortcut[]>;addShortcuts:(items:Shortcut[],workspaceId:string)=>boolean;createBackup:()=>WorkspaceBackup}
const signature=(snapshot:WorkspaceBackup)=>JSON.stringify({...snapshot,exportedAt:''})
function prepare(action:DesktopMutation,state:MutationState):(()=>string|undefined)|string{
 const input={workspaces:state.workspaces.value,folders:state.folders.value,shortcutIds:state.shortcuts.value.map(s=>s.id)}
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
export async function applyDesktopMutation(action:DesktopMutation,state:MutationState):Promise<string|undefined>{
 if(busy)return '另一个桌面操作正在保存，请稍后重试。'
 busy=true
 try{
  const apply=prepare(action,state)
  if(typeof apply==='string')return apply
  const snapshot=state.createBackup(),expected=signature(snapshot)
  await captureHistory(snapshot,'before-change')
  if(signature(state.createBackup())!==expected)return '备份期间数据已变化，请重新操作。'
  return apply()
 }catch(error){return '桌面操作已停止：'+(error instanceof Error?error.message:'无法保存恢复点。')}
 finally{busy=false}
}
