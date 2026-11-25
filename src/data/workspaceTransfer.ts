import { migrationCandidateLimit, validateMigrationCandidate, planStorageMigration, readMigrationCandidate, readMigrationSource, same, type MigrationCandidate } from './storagePreflight'
import { readIntent } from '../desktop/transactionIntent'

export const transferLimit = migrationCandidateLimit + 4096
function origin(value:string){
 const url=new URL(value)
 if(!['http:','https:'].includes(url.protocol)||url.origin!==value||value.length>1024)throw new Error('请输入完整 HTTP(S) origin，不含路径或末尾斜线。')
 return value
}
interface Transfer {
 format:'inftab-transfer'
 version:1
 sourceOrigin:string
 targetOrigin:string
 candidate:MigrationCandidate
 sha256:string
}
async function digest(source:string,target:string,candidate:MigrationCandidate){
 const bytes=new TextEncoder().encode(JSON.stringify(['inftab-transfer',1,source,target,candidate]))
 const hash=await crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')
}
function size(text:string){return new Blob([text]).size}
export async function createTransfer(targetOrigin:string){
 const source=origin(location.origin),target=origin(targetOrigin)
 if(source===target)throw new Error('迁移目标必须为独立 origin。')
 if(await readIntent())throw new Error('存在未完成桌面事务，请先恢复。')
 const candidate=await readMigrationCandidate()
 if(!candidate)throw new Error('请先在原应用保存迁移候选。')
 if(!same(candidate.source,readMigrationSource()))throw new Error('来源数据已变化，请重新生成候选。')
 const transfer:Transfer={format:'inftab-transfer',version:1,sourceOrigin:source,targetOrigin:target,candidate,sha256:await digest(source,target,candidate)}
 const text=JSON.stringify(transfer)
 if(size(text)>transferLimit)throw new Error('迁移文件超过大小限制。')
 if(await readIntent()||!same(candidate,await readMigrationCandidate())||!same(candidate.source,readMigrationSource()))throw new Error('导出期间来源变化，请重新生成候选。')
 return text
}
export async function inspectTransfer(text:string,expectedSource:string){
 if(size(text)>transferLimit)throw new Error('迁移文件超过大小限制。')
 const source=origin(expectedSource),target=origin(location.origin)
 if(source===target)throw new Error('迁移目标必须为独立 origin。')
 const file=JSON.parse(text) as Transfer
 if(!file||file.format!=='inftab-transfer'||file.version!==1||file.sourceOrigin!==source||file.targetOrigin!==target||typeof file.sha256!=='string')throw new Error('迁移文件格式或来源/目标不匹配。')
 const candidate=validateMigrationCandidate(file.candidate)
 if(!candidate||await digest(source,target,candidate)!==file.sha256)throw new Error('迁移文件 SHA256 校验失败。')
 const {report}=planStorageMigration(candidate.backup,candidate.source)
 return {candidate,report}
}
