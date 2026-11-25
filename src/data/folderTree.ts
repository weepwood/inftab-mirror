import type { ShortcutFolder } from '../types'
import type { HomeWorkspace } from './homeWorkspaces'

export const maxFolderDepth=8
/** Invalid edges are flattened, never discard a folder or its shortcuts. */
export function normalizeFolderTree(folders:ShortcutFolder[]):ShortcutFolder[]{
 const byId=new Map(folders.map(f=>[f.id,f]))
 return folders.map(folder=>{
  const {parentId,...rest}=folder
  if(!parentId)return rest
  const seen=new Set([folder.id])
  let cursor:string|undefined=parentId
  while(cursor){
   if(seen.has(cursor)||seen.size>=maxFolderDepth||!byId.has(cursor))return rest
   seen.add(cursor);cursor=byId.get(cursor)?.parentId
  }
  return {...rest,parentId}
 })
}
/** Only same-workspace edges participate in the desktop hierarchy. */
export function folderParents(folders:ShortcutFolder[],workspace:HomeWorkspace|undefined):Map<string,string>{
 const ids=new Set(workspace?.itemIds??[])
 return new Map(normalizeFolderTree(folders.filter(f=>ids.has(f.id))).flatMap(f=>f.parentId?[[f.id,f.parentId] as const]:[]))
}
export function folderDescendants(id:string,parents:ReadonlyMap<string,string>):string[]{
 const result:string[]=[]
 const seen=new Set([id])
 function visit(parent:string){
  for(const [child,owner] of parents)if(owner===parent&&!seen.has(child)){seen.add(child);result.push(child);visit(child)}
 }
 visit(id);return result
}
export function planFolderParent(folders:ShortcutFolder[],workspace:HomeWorkspace|undefined,ids:string[],target:string|null):ShortcutFolder[]|undefined{
 if(!workspace||!ids.length)return
 const available=new Set(folders.filter(f=>workspace.itemIds.includes(f.id)).map(f=>f.id))
 if(ids.some(id=>!available.has(id))||(target!==null&&!available.has(target)))return
 const selected=new Set(ids)
 const parents=folderParents(folders,workspace)
 if(target!==null&&ids.some(id=>id===target||folderDescendants(id,parents).includes(target)))return
 const next:ShortcutFolder[]=folders.map(f=>{
  if(!selected.has(f.id))return f
  const {parentId:_,...rest}=f
  return target===null?rest:{...rest,parentId:target}
 })
 const normalized=normalizeFolderTree(next)
 // Reject instead of silently flattening a valid descendant due to excessive depth.
 if(next.some((f,index)=>f.parentId!==normalized[index]?.parentId))return
 return normalized
}
