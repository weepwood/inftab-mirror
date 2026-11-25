import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'
import { isRecord } from './validation'

export interface WorkspaceConflict { path: string; reason: 'concurrent-edit' | 'delete-edit' | 'order' | 'reference' }
export type WorkspaceMergePlan = { conflicts: WorkspaceConflict[]; merged?: WorkspaceBackup }
import { same } from './storagePreflight'
function pathAt(path:string,key:string){return path+'/'+key.replaceAll('~','~0').replaceAll('/','~1')}
function identified(value:unknown[]):value is (Record<string,unknown>&{id:string})[]{
 return value.every(v=>isRecord(v)&&typeof v.id==='string'&&!!v.id)&&new Set(value.map(v=>(v as {id:string}).id)).size===value.length
}
/** Conservative merge: never silently resolve overlapping fields, deletes, order or references. */
export function planWorkspaceConflict(base:WorkspaceBackup,local:WorkspaceBackup,remote:WorkspaceBackup):WorkspaceMergePlan{
 const conflicts:WorkspaceConflict[]=[]
 const fail=(path:string,reason:WorkspaceConflict['reason'])=>{conflicts.push({path,reason});return undefined}
 function merge(b:unknown,l:unknown,r:unknown,path:string):unknown{
  if(same(l,r))return l
  if(same(l,b))return r
  if(same(r,b))return l
  if(l===undefined||r===undefined)return fail(path,'delete-edit')
  if(isRecord(b)&&isRecord(l)&&isRecord(r)){
   return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].flatMap(k=>{
    const value=merge(Object.hasOwn(b,k)?b[k]:undefined,Object.hasOwn(l,k)?l[k]:undefined,Object.hasOwn(r,k)?r[k]:undefined,pathAt(path,k))
    return value===undefined?[]:[[k,value]]
   }))
  }
  if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&identified(b)&&identified(l)&&identified(r)){
   const map=(a:typeof b)=>new Map(a.map(v=>[v.id,v]))
   const bm=map(b),lm=map(l),rm=map(r)
   const ids=(a:typeof b)=>a.map(v=>v.id)
   const shared=(a:typeof b)=>ids(a).filter(id=>bm.has(id))
   const reordered=(a:typeof b)=>!same(shared(a),ids(b).filter(id=>a.some(v=>v.id===id)))
   // Concurrent order changes or reorder plus membership changes require explicit choice.
   const lr=reordered(l),rr=reordered(r)
   if((lr&&rr&&!same(ids(l),ids(r)))||(lr&&!same(ids(r),ids(b))&&!same(ids(l),ids(r)))||(rr&&!same(ids(l),ids(b))&&!same(ids(l),ids(r))))return fail(path,'order')
   const values=new Map<string,unknown>()
   for(const id of new Set([...ids(b),...ids(l),...ids(r)])){
    const value=merge(bm.get(id),lm.get(id),rm.get(id),pathAt(path,id))
    if(value!==undefined)values.set(id,value)
   }
   const orderFor=(a:typeof b)=>ids(a).filter(id=>values.has(id))
   const lo=orderFor(l),ro=orderFor(r),bo=orderFor(b)
   if(same(lo,ro))return lo.map(id=>values.get(id))
   if(same(lo,bo)&&ro.length===values.size)return ro.map(id=>values.get(id))
   if(same(ro,bo)&&lo.length===values.size)return lo.map(id=>values.get(id))
   // Preserve relative order from both membership-only edits, including
   // insertion anchors. A cycle indicates incompatible ordering.
   const edges=new Map([...values.keys()].map(id=>[id,new Set<string>()]))
   const indegree=new Map([...values.keys()].map(id=>[id,0]))
   for(const seq of [ro,lo]){
    for(let i=1;i<seq.length;i++){
     const a=seq[i-1]!,z=seq[i]!,next=edges.get(a)!
     if(!next.has(z)){next.add(z);indegree.set(z,indegree.get(z)!+1)}
    }
   }
   const priority=[...new Set([...bo,...ro,...lo])]
   const result:unknown[]=[]
   const remaining=new Set(priority)
   while(remaining.size){
    const id=priority.find(id=>remaining.has(id)&&indegree.get(id)===0)
    if(id===undefined)return fail(path,'order')
    remaining.delete(id);result.push(values.get(id))
    for(const next of edges.get(id)!)indegree.set(next,indegree.get(next)!-1)
   }
   return result
  }
  return fail(path,'concurrent-edit')
 }
 // Export timestamps are metadata rather than competing edits.
 const merged=merge({...base,exportedAt:''},{...local,exportedAt:''},{...remote,exportedAt:''},'')
 if(conflicts.length)return {conflicts}
 try{
  const validated=parseWorkspaceBackup(merged)
  if(!same(merged,JSON.parse(JSON.stringify(validated))))return {conflicts:[{path:'/',reason:'reference'}]}
  return {conflicts,merged:validated}
 }catch{return {conflicts:[{path:'/',reason:'reference'}]}}
}
