import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'
import { createLocalId } from './createId'
import { readIntent } from '../desktop/transactionIntent'

const keys = {
  'inftab.preferences.v1': 'preferences', 'inftab.shortcuts.v1': 'shortcuts',
  'inftab.folders.v1': 'folders', 'inftab.launcher-order.v1': 'launcherOrder',
  'inftab.home-workspaces.v1': 'homeWorkspaces', 'inftab.active-home-workspace.v1': 'activeHomeWorkspaceId',
  'inftab.todos.v1': 'todos', 'inftab.habits.v1': 'habits', 'inftab.countdowns.v1': 'countdowns',
  'inftab.notes.v1': 'notes', 'inftab.custom-search-engines.v1': 'customSearchEngines',
  'inftab.active-note.v1': 'activeNoteId', 'inftab.weather-city.v1': 'weatherCity',
  'inftab.focus-timer.v1': 'focusTimer',
} as const
const extraKeys = ['inftab.desktop-mode.v1', 'inftab.weather-city'] as const
export const migrationCandidateLimit = 8 * 1024 * 1024
const database = 'inftab-storage-preflight'
const store = 'candidates'
const slot = 'latest'
type Raw = Record<string, string | null>
export interface MigrationCandidate {
  schema: 1
  id: string
  createdAt: number
  source: Raw
  backup: WorkspaceBackup
}
export interface MigrationReport {
  bytes: number
  persisted: number
  normalizedKeys: string[]
  unknownKeys: string[]
  changedDomains: string[]
  shortcuts: number
  folders: number
  workspaces: number
  notes: number
  todos: number
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
}
function same(a: unknown, b: unknown) { return canonical(a) === canonical(b) }
export function readMigrationSource(storage: Storage = localStorage): Raw {
  const known = [...Object.keys(keys), ...extraKeys]
  // Legacy position keys are retained verbatim, even when no current workspace references them.
  for (let i=0;i<storage.length;i++) {
    const key = storage.key(i)
    if (key?.startsWith('inftab.desktop.v1.')) known.push(key)
  }
  return Object.fromEntries([...new Set(known)].sort().map(key => [key, storage.getItem(key)]))
}
function size(candidate: MigrationCandidate) { return new Blob([JSON.stringify(candidate)]).size }
export function planStorageMigration(backup: WorkspaceBackup, source: Raw, unknownKeys: string[] = []) {
  const parsed = parseWorkspaceBackup(backup)
  const changedDomains = Object.keys(parsed).filter(key => key !== 'exportedAt' && !same(parsed[key as keyof WorkspaceBackup], backup[key as keyof WorkspaceBackup]))
  const normalizedKeys: string[] = []
  for (const [key, field] of Object.entries(keys)) {
    if (source[key] == null) continue
    let raw: unknown
    try { raw = JSON.parse(source[key]!) } catch { throw new Error('旧数据包含损坏的 JSON：'+key+'。请先导出备份并检查，不会创建候选。') }
    if (!same(raw, backup[field])) normalizedKeys.push(key)
  }
  const candidate: MigrationCandidate = {schema:1,id:createLocalId(),createdAt:Date.now(),source:{...source},backup:JSON.parse(JSON.stringify(backup))}
  const report: MigrationReport = {
    bytes:size(candidate),persisted:Object.values(source).filter(x=>x!==null).length,normalizedKeys,unknownKeys,changedDomains,
    shortcuts:backup.shortcuts.length,folders:backup.folders.length,workspaces:backup.homeWorkspaces?.length??1,notes:backup.notes.length,todos:backup.todos.length,
  }
  return {candidate,report}
}
function validate(value: unknown): MigrationCandidate | undefined {
  if(value===undefined)return
  const c=value as MigrationCandidate
  if(!c||c.schema!==1||typeof c.id!=='string'||!Number.isFinite(c.createdAt)||!c.source||!c.backup)throw new Error('迁移候选损坏，拒绝覆盖。')
  const mandatory=[...Object.keys(keys),...extraKeys]
  if(mandatory.some(k=>!Object.hasOwn(c.source,k))||Object.entries(c.source).some(([k,v])=>(!mandatory.includes(k)&&!k.startsWith('inftab.desktop.v1.'))||(v!==null&&typeof v!=='string'))||size(c)>migrationCandidateLimit)throw new Error('迁移候选的来源记录无效。')
  parseWorkspaceBackup(c.backup)
  return c
}
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(database,1);let blocked=false
    req.onupgradeneeded=()=>req.result.createObjectStore(store)
    req.onblocked=()=>{blocked=true;reject(new Error('迁移候选数据库被占用。'))}
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{if(blocked){req.result.close();return}req.result.onversionchange=()=>req.result.close();resolve(req.result)}
  })
}
async function access<T>(mode:IDBTransactionMode,run:(object:IDBObjectStore,set:(value:T)=>void,abort:(reason:unknown)=>void)=>void):Promise<T>{
  const db=await open()
  try{return await new Promise<T>((resolve,reject)=>{
    let tx:IDBTransaction
    try{tx=db.transaction(store,mode,mode==='readwrite'?{durability:'strict'}:undefined)}
    catch(error){if(!(error instanceof TypeError))throw error;tx=db.transaction(store,mode)}
    let result:T,error:unknown
    tx.oncomplete=()=>resolve(result)
    tx.onabort=()=>reject(error??tx.error??new Error('迁移候选事务已中止。'))
    const abort=(reason:unknown)=>{error=reason;tx.abort()}
    try{run(tx.objectStore(store),v=>{result=v},abort)}catch(e){abort(e)}
  })}finally{db.close()}
}
export function readMigrationCandidate(){return access<MigrationCandidate|undefined>('readonly',(object,set,abort)=>{
  const req=object.get(slot);req.onsuccess=()=>{try{set(validate(req.result))}catch(e){abort(e)}}
})}
export function isCandidateCurrent(candidate:MigrationCandidate,backup:WorkspaceBackup,source:Raw=readMigrationSource()){
  return same(candidate.source,source)&&same({...candidate.backup,exportedAt:''},{...backup,exportedAt:''})
}
export async function prepareMigration(getBackup:()=>WorkspaceBackup){
  if(await readIntent())throw new Error('存在未完成的桌面事务，请先恢复。')
  const source=readMigrationSource()
  const unknownKeys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter((k):k is string=>!!k&&k.startsWith('inftab.')&&!Object.hasOwn(source,k)).sort()
  const plan=planStorageMigration(getBackup(),source,unknownKeys)
  if(!isCandidateCurrent(plan.candidate,getBackup()))throw new Error('检查期间数据发生变化，请重新检查。')
  return plan
}
export async function stageMigration(candidate:MigrationCandidate,expectedId:string|null,getBackup:()=>WorkspaceBackup){
  if(size(candidate)>migrationCandidateLimit)throw new Error('迁移候选超过8 MiB，请导出备份。')
  if(await readIntent())throw new Error('存在未完成的桌面事务，请先恢复。')
  if(!isCandidateCurrent(candidate,getBackup()))throw new Error('来源数据已变化，请重新检查。')
  await access<void>('readwrite',(object,set,abort)=>{
    const req=object.get(slot);req.onsuccess=()=>{try{
      const current=validate(req.result)
      if((current?.id??null)!==expectedId)throw new Error('另一个标签页更新了迁移候选，请重新读取。')
      if(!isCandidateCurrent(candidate,getBackup()))throw new Error('来源数据已变化，请重新检查。')
      object.put(candidate,slot);set(undefined)
    }catch(e){abort(e)}}
  })
  const stored=await readMigrationCandidate()
  if(!stored||!same(stored,candidate))throw new Error('候选回读不一致，请重新检查。')
  return stored
}
export function discardMigrationCandidate(expectedId:string){return access<void>('readwrite',(object,set,abort)=>{
  const req=object.get(slot);req.onsuccess=()=>{try{
    if(validate(req.result)?.id!==expectedId)throw new Error('候选已变化，请重新读取。')
    object.delete(slot);set(undefined)
  }catch(e){abort(e)}}
})}
