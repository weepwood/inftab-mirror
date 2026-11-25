import { createTransfer, inspectTransfer, transferLimit } from './data/workspaceTransfer'
import { createWorkspaceAuthority, type AuthorityState } from './data/workspaceAuthority'
import { downloadText } from './data/downloadBackup'

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const target=el<HTMLInputElement>('target'),source=el<HTMLInputElement>('source'),file=el<HTMLInputElement>('file')
const controls=el<HTMLFieldSetElement>('controls'),status=el('status'),preview=el('preview'),state=el('state')
const prepare=el<HTMLButtonElement>('prepare'),activate=el<HTMLButtonElement>('activate'),archive=el<HTMLButtonElement>('archive'),record=el<HTMLButtonElement>('record')
let reviewed:{text:string;source:string;result:Awaited<ReturnType<typeof inspectTransfer>>}|undefined
let stored:AuthorityState|undefined,storedSource='',busy=false
el('origin').textContent=location.origin
function reset(){
 reviewed=undefined;stored=undefined;storedSource='';preview.textContent='';state.textContent=''
 prepare.disabled=activate.disabled=archive.disabled=record.disabled=true
}
source.addEventListener('input',reset)
async function run(action:()=>Promise<void>){
 if(busy)return
 busy=true;controls.disabled=true;status.textContent=''
 try{await action()}catch(error){status.textContent=error instanceof Error?error.message:String(error)}
 finally{busy=false;controls.disabled=false}
}
async function refresh(){
 const expected=source.value.trim(),read=await createWorkspaceAuthority(expected).read()
 stored=read.state;storedSource=expected
 state.textContent=read.mode+(stored?' · Revision '+stored.revision:'')
 activate.disabled=read.mode!=='prepared'
 archive.disabled=!stored||stored.phase==='archived'
 record.disabled=!stored
}
el('export').addEventListener('click',()=>void run(async()=>{
 downloadText(await createTransfer(target.value.trim()),'application/json','inftab-transfer.json')
 status.textContent='迁移文件已生成，未修改原数据。'
}))
file.addEventListener('change',()=>void run(async()=>{
 const selected=file.files?.[0];file.value='';reset()
 if(!selected)return
 if(selected.size>transferLimit)throw new Error('迁移文件超过大小限制。')
 const text=await selected.text(),expected=source.value.trim()
 const result=await inspectTransfer(text,expected)
 reviewed={text,source:expected,result}
 const r=result.report
 preview.textContent='SHA256 通过 · '+r.shortcuts+' 个入口 / '+r.folders+' 个文件夹 / '+r.notes+' 条笔记 / '+r.todos+' 条待办\n规范化字段：'+(r.changedDomains.join('、')||'无')+'\n原始值与快照差异：'+(r.normalizedKeys.join('、')||'无')
 prepare.disabled=false;status.textContent='检查通过，尚未初始化。'
}))
prepare.addEventListener('click',()=>void run(async()=>{
 const p=reviewed
 if(!p||p.source!==source.value.trim())return
 if(!window.confirm('确认使用此候选初始化独立目标记录？接受显示的规范化，原始候选仍保留。'))return
 const result=await inspectTransfer(p.text,p.source)
 await createWorkspaceAuthority(p.source).prepare(result.candidate,true)
 reviewed=undefined;prepare.disabled=true
 await refresh();status.textContent='目标记录已准备，未修改原站数据。'
}))
el('refresh').addEventListener('click',()=>void run(async()=>{await refresh();status.textContent='已读取目标记录。'}))
function change(kind:'activate'|'archive'){
 return run(async()=>{
  const old=stored
  if(!old||storedSource!==source.value.trim())return
  if(!window.confirm(kind==='activate'?'仅启用独立控制台记录，不会切换正式应用。继续？':'归档独立记录并永久停止其写入？'))return
  await createWorkspaceAuthority(storedSource).transition(old,{kind})
  await refresh();status.textContent='目标记录状态已更新。'
 })
}
activate.addEventListener('click',()=>void change('activate'))
archive.addEventListener('click',()=>void change('archive'))
record.addEventListener('click',()=>{if(stored)downloadText(JSON.stringify(stored),'application/json','inftab-authority-record.json')})
