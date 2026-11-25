import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { ShortcutFolder } from '../types'

type State = { workspaces: HomeWorkspace[]; folders: ShortcutFolder[]; shortcutIds: readonly string[] }
type MovePlan = Pick<State, 'workspaces' | 'folders'>

function getOwners(workspaces: HomeWorkspace[]) {
  const owners = new Map<string, string>()
  for (const workspace of workspaces) for (const id of workspace.itemIds) owners.set(id, workspace.id)
  return owners
}

/** Preflight the entire selection before mutating persisted state. */
export function planWorkspaceMove(state: State, ids: readonly string[], targetId: string): MovePlan | undefined {
  if (!ids.length || !state.workspaces.some(w => w.id === targetId)) return
  const owners = getOwners(state.workspaces)
  const shortcuts = new Set(state.shortcutIds)
  const byFolder = new Map(state.folders.map(folder => [folder.id, folder]))
  const moved = new Set<string>()
  for (const id of ids) {
    const owner = owners.get(id)
    if (!owner) return
    const folder = byFolder.get(id)
    if (folder) {
      // A stale or already inconsistent folder must not steal another workspace's link.
      if (folder.shortcutIds.some(member => !shortcuts.has(member) || owners.get(member) !== owner)) return
      for (const member of folder.shortcutIds) moved.add(member)
    } else if (!shortcuts.has(id)) return
    moved.add(id)
  }
  const workspaces = state.workspaces.map(workspace => {
    const itemIds = workspace.id === targetId
      ? [...new Set([...workspace.itemIds, ...moved])]
      : workspace.itemIds.filter(id => !moved.has(id))
    const desktop = workspace.desktop && { ...workspace.desktop, positions: Object.fromEntries(Object.entries(workspace.desktop.positions).filter(([id]) => itemIds.includes(id))) }
    return { ...workspace, itemIds, ...(desktop ? { desktop } : {}) }
  })
  const folders = state.folders.map(folder => {
    if (moved.has(folder.id) || owners.get(folder.id) === targetId) return folder
    const shortcutIds = folder.shortcutIds.filter(id => !moved.has(id))
    return shortcutIds.length === folder.shortcutIds.length ? folder : { ...folder, shortcutIds }
  })
  return { workspaces, folders }
}

export function planFolderMembership(state: State, ids: readonly string[], targetId: string | null): ShortcutFolder[] | undefined {
  if (!ids.length) return
  const owners = getOwners(state.workspaces)
  const shortcuts = new Set(state.shortcutIds)
  const selected = new Set(ids)
  const target = targetId === null ? undefined : state.folders.find(folder => folder.id === targetId)
  const targetOwner = target && owners.get(target.id)
  if (targetId !== null && (!target || !targetOwner)) return
  if (ids.some(id => !shortcuts.has(id) || !owners.has(id) || (targetOwner && owners.get(id) !== targetOwner))) return
  return state.folders.map(folder => {
    const shortcutIds = folder.id === targetId
      ? [...new Set([...folder.shortcutIds, ...ids])]
      : folder.shortcutIds.filter(id => !selected.has(id))
    return { ...folder, shortcutIds }
  })
}

export interface FinderClipboard { mode:'cut'|'copy'; ids:string[]; workspaceId:string; folderId:string|null }
export type DesktopMutation = {kind:'move';ids:string[];workspaceId:string}|{kind:'membership';ids:string[];folderId:string|null}|{kind:'paste';clipboard:FinderClipboard;workspaceId:string;folderId:string|null}
export function planPaste(state:State,clipboard:FinderClipboard,workspaceId:string,folderId:string|null,copyIds:string[]=[]):MovePlan|undefined {
 const ids=[...new Set(clipboard.ids)]
 const owners=getOwners(state.workspaces)
 const source=state.workspaces.find(w=>w.id===clipboard.workspaceId)
 const target=state.workspaces.find(w=>w.id===workspaceId)
 if(!source||!target||!ids.length||ids.length!==clipboard.ids.length)return
 if(ids.some(id=>!state.shortcutIds.includes(id)||owners.get(id)!==source.id||((state.folders.find(f=>f.shortcutIds.includes(id))?.id??null)!==clipboard.folderId)))return
 if(folderId!==null&&(!target.itemIds.includes(folderId)||!state.folders.some(f=>f.id===folderId)))return
 if(clipboard.mode==='copy'){
  if(copyIds.length!==ids.length||new Set(copyIds).size!==copyIds.length||copyIds.some(id=>owners.has(id)||state.shortcutIds.includes(id)))return
  const workspaces=state.workspaces.map(w=>w.id===workspaceId?{...w,itemIds:[...w.itemIds,...copyIds]}:w)
  const folders=planFolderMembership({...state,workspaces,shortcutIds:[...state.shortcutIds,...copyIds]},copyIds,folderId)
  return folders?{workspaces,folders}:undefined
 }
 const moved=planWorkspaceMove(state,ids,workspaceId)
 if(!moved)return
 const folders=planFolderMembership({...state,...moved},ids,folderId)
 return folders?{...moved,folders}:undefined
}
