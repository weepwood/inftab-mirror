import { planWorkspaceConflict } from './workspaceConflict'
import { strictSnapshot, type GenerationState } from './workspaceGeneration'
import type { WorkspaceBackup } from './backup'

export function exportRehearsalDraft(state:GenerationState){
 return JSON.stringify({format:'inftab-rehearsal',version:1,generation:state.generation,revision:state.revision,draft:JSON.parse(state.head)})
}
export function previewRehearsalDraft(content:string,state:GenerationState){
 const file=JSON.parse(content)
 if(file?.format!=='inftab-rehearsal'||file.version!==1||file.generation!==state.generation||!Number.isSafeInteger(file.revision))throw new Error('草稿缺少匹配的世代和版本，请重新导出。')
 const base=file.revision===state.revision?state.head:file.revision===state.revision-1?state.previous:undefined
 if(base===undefined)throw new Error('草稿基础版本已不在保留范围，请导出当前草稿后手动合并。')
 const local=strictSnapshot(JSON.stringify(file.draft))
 const plan=planWorkspaceConflict(JSON.parse(base),local,JSON.parse(state.head))
 return {...plan,baseRevision:file.revision,expected:{generation:state.generation,revision:state.revision},local:local as WorkspaceBackup}
}
