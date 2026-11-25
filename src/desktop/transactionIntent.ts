import { createLocalId } from '../data/createId'
export const transactionKeys=['inftab.shortcuts.v1','inftab.folders.v1','inftab.launcher-order.v1','inftab.home-workspaces.v1'] as const
type Key=typeof transactionKeys[number]
export type TransactionValues=Record<Key,string|null>
export interface TransactionIntent {id:string;before:TransactionValues;after:TransactionValues;createdAt:number}
const dbName='inftab-desktop-transactions',storeName='intents',slot='pending'
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(dbName,1);let blocked=false
  request.onupgradeneeded=()=>request.result.createObjectStore(storeName)
  request.onblocked=()=>{blocked=true;reject(new Error('桌面事务数据库被占用。'))}
  request.onerror=()=>reject(request.error)
  request.onsuccess=()=>{if(blocked){request.result.close();return}request.result.onversionchange=()=>request.result.close();resolve(request.result)}
 })
}
function validate(value:unknown):TransactionIntent|undefined{
 if(value===undefined)return
 const v=value as TransactionIntent
 if(!v||typeof v.id!=='string'||!Number.isFinite(v.createdAt)||!v.before||!v.after||transactionKeys.some(k=>(v.before[k]!==null&&typeof v.before[k]!=='string')||(v.after[k]!==null&&typeof v.after[k]!=='string')))throw new Error('事务记录损坏，拒绝覆盖。')
 return v
}
export function readTransactionValues(storage:Pick<Storage,'getItem'>=localStorage):TransactionValues{
 return Object.fromEntries(transactionKeys.map(k=>[k,storage.getItem(k)])) as TransactionValues
}
export function canReplay(intent:TransactionIntent,current:TransactionValues){
 return transactionKeys.every(k=>current[k]===intent.before[k]||current[k]===intent.after[k])
}
async function access<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,finish:(value:T)=>void,abort:(error:unknown)=>void)=>void):Promise<T>{
 const db=await open()
 try{return await new Promise<T>((resolve,reject)=>{
  let tx:IDBTransaction
  try{tx=db.transaction(storeName,mode,mode==='readwrite'?{durability:'strict'}:undefined)}
  catch(error){if(!(error instanceof TypeError))throw error;tx=db.transaction(storeName,mode)}
  let result:T,error:unknown
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error??new Error('桌面事务已中止。'))
  const abort=(reason:unknown)=>{error=reason;tx.abort()}
  try{run(tx.objectStore(storeName),value=>{result=value},abort)}catch(e){abort(e)}
 })}finally{db.close()}
}
export function readIntent(){return access<TransactionIntent|undefined>('readonly',(store,finish,abort)=>{
 const request=store.get(slot);request.onsuccess=()=>{try{finish(validate(request.result))}catch(e){abort(e)}}
})}
export function beginIntent(before:TransactionValues,after:TransactionValues){
 const intent={id:createLocalId(),before,after,createdAt:Date.now()}
 if(new Blob([JSON.stringify(intent)]).size>8*1024*1024)throw new Error('桌面事务超过8 MiB，请先导出备份。')
 return access<TransactionIntent>('readwrite',(store,finish,abort)=>{
  const request=store.get(slot);request.onsuccess=()=>{try{
   if(validate(request.result))throw new Error('有未完成的桌面事务，请先恢复。')
   store.put(intent,slot);finish(intent)
  }catch(e){abort(e)}}
 })
}
export function finishIntent(id:string){return access<void>('readwrite',(store,finish,abort)=>{
 const request=store.get(slot);request.onsuccess=()=>{try{
  if(validate(request.result)?.id!==id)throw new Error('桌面事务版本已变化。')
  store.delete(slot);finish(undefined)
 }catch(e){abort(e)}}
})}
/** Explicit, compare-before-replay; no unknown or newer value may be overwritten. */
export function replayIntent(intent:TransactionIntent,direction:'rollback'|'complete',storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>=localStorage){
 if(!canReplay(intent,readTransactionValues(storage)))throw new Error('事务后存在其他数据修改，无法安全恢复，请使用备份。')
 const target=direction==='rollback'?intent.before:intent.after
 for(const key of transactionKeys){
  const current=storage.getItem(key)
  if(current===target[key])continue
  if(current!==intent.before[key]&&current!==intent.after[key])throw new Error('恢复期间数据已变化。')
  if(target[key]===null)storage.removeItem(key)
  else storage.setItem(key,target[key]!)
 }
 if(!transactionKeys.every(k=>storage.getItem(k)===target[k]))throw new Error('事务恢复尚未完整写入。')
}
