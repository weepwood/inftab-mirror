/**
 * Isolated transactional workspace rehearsal. The application still uses v1
 * localStorage. This store must never be selected implicitly at bootstrap.
 */
import { accessSnapshot } from './snapshotStore'
import { parseWorkspaceBackup, type WorkspaceBackup } from './backup'
import { createLocalId } from './createId'
import { isCandidateCurrent, readMigrationSource, validateMigrationCandidate, same, type MigrationCandidate } from './storagePreflight'
import { readIntent } from '../desktop/transactionIntent'

export const generationDatabase = 'inftab-workspace-generation'
const storeName = 'generations', slot = 'latest'
const limit = 8 * 1024 * 1024
export type GenerationPhase = 'prepared' | 'rehearsal' | 'retired'
export interface GenerationToken { generation: string; revision: number }
export interface GenerationState extends GenerationToken {
  schema: 1
  phase: GenerationPhase
  candidate: MigrationCandidate
  head: string
  previous?: string
}
export function strictSnapshot(content:string): WorkspaceBackup {
  if(typeof content!=='string'||new Blob([content]).size>limit)throw new Error('工作区快照无效或超过 8 MiB。')
  const input=JSON.parse(content)
  const parsed=parseWorkspaceBackup(input)
  if(!same(input,JSON.parse(JSON.stringify(parsed))))throw new Error('工作区快照需要规范化，拒绝隐式丢失数据。')
  return parsed
}
function validateState(value:unknown):GenerationState|undefined{
  if(value===undefined)return
  const v=value as GenerationState
  if(!v||v.schema!==1||typeof v.generation!=='string'||!v.generation||!Number.isSafeInteger(v.revision)||v.revision<1||!['prepared','rehearsal','retired'].includes(v.phase)||!validateMigrationCandidate(v.candidate))throw new Error('存储世代记录损坏。')
  strictSnapshot(v.head)
  if(v.previous!==undefined)strictSnapshot(v.previous)
  if(v.phase==='prepared'&&(v.revision!==1||v.previous!==undefined||!same(JSON.parse(v.head),JSON.parse(JSON.stringify(parseWorkspaceBackup(v.candidate.backup))))))throw new Error('初始化记录不一致。')
  return v
}
function access<T>(mode:IDBTransactionMode,operation:(state:GenerationState|undefined,store:IDBObjectStore)=>T){
 return accessSnapshot<T>(generationDatabase,storeName,mode,(store,finish,abort)=>{
  const req=store.get(slot)
  req.onsuccess=()=>{try{finish(operation(validateState(req.result),store))}catch(e){abort(e)}}
 })
}
function assertToken(state:GenerationState|undefined,token:GenerationToken):asserts state is GenerationState{
  if(!state||state.generation!==token.generation||state.revision!==token.revision||state.revision>=Number.MAX_SAFE_INTEGER)throw new Error('存储世代或版本冲突，请重新读取。')
}
function assertSource(state:GenerationState){
  if(!same(state.candidate.source,readMigrationSource()))throw new Error('检测到旧存储修改，停止演练并保留两份数据。')
}
async function assertNoIntent(){
  if(await readIntent())throw new Error('存在未完成的桌面事务，请先恢复。')
}
export async function inspectGeneration(){
  const state=await access('readonly',state=>state)
  return {state,sourceChanged:!!state&&!same(state.candidate.source,readMigrationSource())}
}
/** Creation and retirement never touch the legacy keys or the original journal. */
export async function prepareGeneration(candidate:MigrationCandidate,expected:GenerationToken|null,getBackup:()=>WorkspaceBackup,acceptNormalization=false,discardRetiredDraft=false){
  const copy=validateMigrationCandidate(structuredClone(candidate))!
  const head=JSON.stringify(parseWorkspaceBackup(copy.backup))
  if(!same(JSON.parse(head),copy.backup)&&!acceptNormalization)throw new Error('候选需要显式确认规范化，原始数据保持不变。')
  strictSnapshot(head)
  await assertNoIntent()
  return access('readwrite',(state,store)=>{
    if(expected===null){if(state)throw new Error('已有存储世代，请重新读取。')}
    else{
      assertToken(state,expected)
      if(state.phase!=='retired')throw new Error('请先结束现有演练。')
      const original=JSON.stringify(parseWorkspaceBackup(state.candidate.backup))
      if(!discardRetiredDraft&&(!same(JSON.parse(state.head),JSON.parse(original))||(state.previous!==undefined&&!same(JSON.parse(state.previous),JSON.parse(original)))))throw new Error('退役世代仍有独立草稿，请先导出并明确确认替换。')
    }
    if(!isCandidateCurrent(copy,getBackup()))throw new Error('迁移候选已过期，请重新检查。')
    const next:GenerationState={schema:1,generation:createLocalId(),revision:1,phase:'prepared',candidate:copy,head}
    store.put(next,slot)
    return next
  })
}
type Transition = {kind:'start'} | {kind:'commit';content:string} | {kind:'rollback'} | {kind:'retire'}
export async function transitionGeneration(token:GenerationToken,action:Transition){
  if(action.kind==='commit')strictSnapshot(action.content)
  if(action.kind!=='retire')await assertNoIntent()
  return access('readwrite',(state,store)=>{
    assertToken(state,token)
    if(state.phase==='retired')throw new Error('当前世代已结束。')
    if(action.kind!=='retire')assertSource(state)
    let next:GenerationState={...state,revision:state.revision+1}
    if(action.kind==='retire')next.phase='retired'
    else if(action.kind==='start'){
      if(state.phase!=='prepared')throw new Error('世代已初始化。')
      next.phase='rehearsal'
    }else{
      if(state.phase!=='rehearsal')throw new Error('请先启动独立演练。')
      const head=action.kind==='commit'?action.content:state.previous
      if(head===undefined)throw new Error('没有可回退的版本。')
      next={...next,head,previous:state.head}
    }
    store.put(next,slot)
    return next
  })
}
