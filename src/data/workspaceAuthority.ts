/**
 * Candidate authoritative snapshot adapter for an explicitly isolated origin.
 * Not selected by the existing application bootstrap. Never mirrors to v1 keys.
 */
import { accessSnapshot } from './snapshotStore'
import { createLocalId } from './createId'
import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'
import { same, validateMigrationCandidate, type MigrationCandidate } from './storagePreflight'
import { strictSnapshot, type GenerationToken } from './workspaceGeneration'

export const authorityDatabase = 'inftab-workspace-authority'
const storeName = 'workspace', slot = 'authority'
export interface AuthorityState extends GenerationToken {
  schema: 1
  sourceOrigin: string
  phase: 'prepared' | 'active' | 'archived'
  original: MigrationCandidate
  head: string
  previous?: string
}
export type AuthorityRead =
  | {mode:'uninitialized'|'prepared'|'archived'|'blocked'; state?: AuthorityState}
  | {mode:'active'; state: AuthorityState; snapshot: WorkspaceBackup}

function requireOrigin(value:string){
  const url=new URL(value)
  if(!['http:','https:'].includes(url.protocol)||url.origin!==value)throw new Error('来源必须是完整 HTTP(S) origin，不是路径。')
  return url.origin
}
function hasLegacyKeys(){
  // Unknown inftab keys are also a reason to stop: this target is reserved
  // for the new adapter, not a parallel installation of the old app.
  for(let i=0;i<localStorage.length;i++)if(localStorage.key(i)?.startsWith('inftab.'))return true
  return false
}
export function createWorkspaceAuthority(sourceOrigin:string){
  const source=requireOrigin(sourceOrigin),target=requireOrigin(location.origin)
  if(source===target)throw new Error('必须使用独立 origin，不能在旧客户端所在 origin 启用权威存储。')
  function validate(value:unknown):AuthorityState|undefined{
    if(value===undefined)return
    const state=value as AuthorityState
    if(!state||state.schema!==1||state.sourceOrigin!==source||typeof state.generation!=='string'||!state.generation||!Number.isSafeInteger(state.revision)||state.revision<1||!['prepared','active','archived'].includes(state.phase)||!validateMigrationCandidate(state.original))throw new Error('权威存储记录无效，禁止回退到旧数据。')
    strictSnapshot(state.head)
    if(state.previous!==undefined)strictSnapshot(state.previous)
    if(state.phase==='prepared'&&(state.revision!==1||state.previous!==undefined||!same(JSON.parse(state.head),JSON.parse(JSON.stringify(parseWorkspaceBackup(state.original.backup))))))throw new Error('权威初始化记录不一致。')
    return state
  }
  function access<T>(mode:IDBTransactionMode,operation:(state:AuthorityState|undefined,store:IDBObjectStore)=>T){
    return accessSnapshot<T>(authorityDatabase,storeName,mode,(store,finish,abort)=>{
      const request=store.get(slot)
      request.onsuccess=()=>{try{finish(operation(validate(request.result),store))}catch(error){abort(error)}}
    })
  }
  function requireClean(){
    if(hasLegacyKeys())throw new Error('目标 origin 检测到旧版数据，禁止权威写入。请先导出双方数据。')
  }
  function checkToken(state:AuthorityState|undefined,token:GenerationToken):asserts state is AuthorityState{
    if(!state||state.generation!==token.generation||state.revision!==token.revision||state.revision>=Number.MAX_SAFE_INTEGER)throw new Error('权威存储版本冲突，请重新读取。')
  }
  async function read():Promise<AuthorityRead>{
    return access<AuthorityRead>('readonly',state=>{
      if(hasLegacyKeys())return {mode:'blocked',state}
      if(!state)return {mode:'uninitialized'}
      return state.phase==='active'?{mode:'active',state,snapshot:strictSnapshot(state.head)}:{mode:state.phase,state}
    })
  }
  /** Import an explicitly transferred candidate. Source remains untouched. */
  async function prepare(candidate:MigrationCandidate,acceptNormalization=false){
    const original=validateMigrationCandidate(structuredClone(candidate))!
    const head=JSON.stringify(parseWorkspaceBackup(original.backup))
    strictSnapshot(head)
    if(!acceptNormalization&&!same(JSON.parse(head),original.backup))throw new Error('导入需要显式确认规范化。')
    return access('readwrite',(state,store)=>{
      requireClean()
      if(state)throw new Error('已有权威记录，不允许重新初始化覆盖。')
      const next:AuthorityState={schema:1,sourceOrigin:source,generation:createLocalId(),revision:1,phase:'prepared',original,head}
      store.put(next,slot);return next
    })
  }
  type Action={kind:'activate'}|{kind:'commit';content:string}|{kind:'rollback'}|{kind:'archive'}
  async function transition(token:GenerationToken,action:Action){
    if(action.kind==='commit')strictSnapshot(action.content)
    return access('readwrite',(state,store)=>{
      checkToken(state,token)
      if(state.phase==='archived')throw new Error('权威记录已归档，禁止写入。')
      if(action.kind!=='archive')requireClean()
      let next:AuthorityState={...state,revision:state.revision+1}
      if(action.kind==='archive')next.phase='archived'
      else if(action.kind==='activate'){
        if(state.phase!=='prepared')throw new Error('权威记录已初始化。')
        next.phase='active'
      }else{
        if(state.phase!=='active')throw new Error('权威存储尚未启用。')
        const head=action.kind==='commit'?action.content:state.previous
        if(head===undefined)throw new Error('没有可回退的权威版本。')
        next={...next,head,previous:state.head}
      }
      store.put(next,slot);return next
    })
  }
  return {read,prepare,transition}
}
