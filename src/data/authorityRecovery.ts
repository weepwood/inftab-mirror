import { accessSnapshot } from './snapshotStore'
import { strictSnapshot, type GenerationToken } from './workspaceGeneration'
import type { WorkspaceBackup } from './backup'

export const recoveryDatabase='inftab-authority-drafts'
const store='drafts'
export const draftLimit=16*1024*1024+4096
const totalLimit=32*1024*1024,maxRecords=8
export interface DraftEnvelope extends GenerationToken {
 format:'inftab-authority-draft'
 version:1
 sourceOrigin:string
 targetOrigin:string
 base:WorkspaceBackup
 draft:WorkspaceBackup
}
export interface RecoveryRecord {id:string;updatedAt:number;content:string}
const bytes=(content:string)=>new Blob([content]).size
export function parseAuthorityDraft(content:string):DraftEnvelope{
 if(typeof content!=='string'||bytes(content)>draftLimit)throw new Error('恢复草稿超过大小限制。')
 const v=JSON.parse(content) as DraftEnvelope
 if(!v||v.format!=='inftab-authority-draft'||v.version!==1||typeof v.sourceOrigin!=='string'||v.targetOrigin!==location.origin||typeof v.generation!=='string'||!v.generation||!Number.isSafeInteger(v.revision)||v.revision<2)throw new Error('恢复草稿来源、世代或版本无效。')
 strictSnapshot(JSON.stringify(v.base));strictSnapshot(JSON.stringify(v.draft))
 return v
}
function validate(value:unknown):RecoveryRecord{
 const record=value as RecoveryRecord
 if(!record||typeof record.id!=='string'||!record.id||!Number.isFinite(record.updatedAt))throw new Error('恢复记录无效。')
 parseAuthorityDraft(record.content)
 return record
}
function access<T>(mode:IDBTransactionMode,operation:(records:RecoveryRecord[],store:IDBObjectStore)=>T){
 return accessSnapshot<T>(recoveryDatabase,store,mode,(object,finish,abort)=>{
  const request=object.getAll()
  request.onsuccess=()=>{try{finish(operation(request.result.map(validate),object))}catch(error){abort(error)}}
 })
}
export function listRecoveryDrafts(){
 return access('readonly',records=>records.sort((a,b)=>b.updatedAt-a.updatedAt))
}
export function writeRecoveryDraft(id:string,content:string){
 parseAuthorityDraft(content)
 return access('readwrite',(records,object)=>{
  const next={id,updatedAt:Date.now(),content},others=records.filter(r=>r.id!==id)
  if(others.length>=maxRecords||others.reduce((n,r)=>n+bytes(r.content),bytes(content))>totalLimit)throw new Error('恢复草稿空间已满，请导出并删除不需要的记录。')
  object.put(next,id);return next
 })
}
export function removeRecoveryDraft(expected:RecoveryRecord){
 return access('readwrite',(records,object)=>{
  const current=records.find(r=>r.id===expected.id)
  if(!current)return
  if(current.content!==expected.content||current.updatedAt!==expected.updatedAt)throw new Error('恢复记录已更新，请重新读取。')
  object.delete(expected.id)
 })
}
