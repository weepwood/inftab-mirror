import {availablePanelIds,type PanelId} from '../plugins/ids'
import type {HomeWorkspace} from '../data/homeWorkspaces'
import {emptyWindows,maxWindows,type WindowState,type DesktopWindow} from './windowManager'
const key='inftab.window-session.v1'
const allowedPanels=new Set<string>(availablePanelIds.filter(id=>!['settings','bookmarks','history'].includes(id)))
const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128
export function sanitizeWindowSession(raw:unknown,workspaces:HomeWorkspace[],folderIds:readonly string[]):WindowState{
 const result=emptyWindows()
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as WindowState).windows))return result
 const spaces=new Map(workspaces.map(w=>[w.id,w])),folders=new Set(folderIds),seen=new Set<string>()
 const fallback=workspaces[0]?.id
 if(!fallback)return result
 for(const value of (raw as WindowState).windows.slice(-maxWindows)){
  if(!value||typeof value!=='object')continue
  const panelId=value.panelId
  if(panelId!==undefined&&!allowedPanels.has(panelId))continue
  const workspaceId=validId(value.workspaceId)&&spaces.has(value.workspaceId)?value.workspaceId:fallback
  const spaceId=validId(value.spaceId)&&spaces.has(value.spaceId)?value.spaceId:fallback
  const folderId=!panelId&&validId(value.folderId)&&folders.has(value.folderId)&&spaces.get(workspaceId)?.itemIds.includes(value.folderId)?value.folderId:undefined
  const identity=panelId?'tool:'+panelId:JSON.stringify([workspaceId,folderId])
  if(seen.has(identity))continue
  seen.add(identity)
  const w:DesktopWindow={id:result.nextId++,workspaceId,spaceId,folderId,panelId:panelId as PanelId|undefined,title:panelId??'Finder',minimized:value.minimized===true,maximized:value.maximized===true,cascade:result.nextId%5}
  if(!panelId&&validId(value.browseWorkspaceId)&&spaces.has(value.browseWorkspaceId)){
   w.browseWorkspaceId=value.browseWorkspaceId
   w.browseFolderId=validId(value.browseFolderId)&&folders.has(value.browseFolderId)&&spaces.get(w.browseWorkspaceId)?.itemIds.includes(value.browseFolderId)?value.browseFolderId:undefined
  }
  result.windows.push(w)
 }
 return result
}
export function readWindowSession(workspaces:HomeWorkspace[],folders:string[]):WindowState{
 try{return sanitizeWindowSession(JSON.parse(sessionStorage.getItem(key)??'null'),workspaces,folders)}catch{return emptyWindows()}
}
export function saveWindowSession(state:WindowState){
 try{sessionStorage.setItem(key,JSON.stringify({windows:state.windows.map(({workspaceId,spaceId,folderId,panelId,minimized,maximized,browseWorkspaceId,browseFolderId})=>({workspaceId,spaceId,folderId,panelId,minimized,maximized,browseWorkspaceId,browseFolderId}))}))}catch{/* optional session state */}
}
