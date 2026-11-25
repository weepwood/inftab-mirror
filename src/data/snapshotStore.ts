/** A single-slot IndexedDB store; resolve only after transaction completion. */
export async function accessSnapshot<T>(database:string,storeName:string,mode:IDBTransactionMode,run:(store:IDBObjectStore,finish:(value:T)=>void,abort:(reason:unknown)=>void)=>void):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open(database,1);let blocked=false
  req.onupgradeneeded=()=>req.result.createObjectStore(storeName)
  req.onblocked=()=>{blocked=true;reject(new Error('本地事务数据库被占用。'))}
  req.onerror=()=>reject(req.error)
  req.onsuccess=()=>{if(blocked){req.result.close();return}req.result.onversionchange=()=>req.result.close();resolve(req.result)}
 })
 try{return await new Promise<T>((resolve,reject)=>{
  let tx:IDBTransaction
  try{tx=db.transaction(storeName,mode,mode==='readwrite'?{durability:'strict'}:undefined)}
  catch(e){if(!(e instanceof TypeError))throw e;tx=db.transaction(storeName,mode)}
  let result:T,failure:unknown
  tx.oncomplete=()=>resolve(result)
  tx.onabort=()=>reject(failure??tx.error??new Error('本地事务已中止。'))
  const abort=(reason:unknown)=>{failure=reason;tx.abort()}
  try{run(tx.objectStore(storeName),value=>{result=value},abort)}catch(e){abort(e)}
 })}finally{db.close()}
}
