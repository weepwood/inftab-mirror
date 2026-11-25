import { openAuthoritySession } from './data/authoritySession'
import { createLocalId } from './data/createId'
import { draftLimit, listRecoveryDrafts, parseAuthorityDraft, removeRecoveryDraft, writeRecoveryDraft, type RecoveryRecord } from './data/authorityRecovery'
import { downloadText } from './data/downloadBackup'
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
export function bindAuthorityEditor(source:HTMLInputElement,run:(action:()=>Promise<void>)=>Promise<void>,onOpen:(opened:boolean)=>void,status:HTMLElement){
 const section=el('authority-editor'),open=el<HTMLButtonElement>('open-editor')
 const select=el<HTMLSelectElement>('editor-note'),title=el<HTMLInputElement>('editor-title'),body=el<HTMLTextAreaElement>('editor-body'),todos=el('editor-todos'),revision=el('editor-revision')
 const save=el<HTMLButtonElement>('editor-save')
 let session:Awaited<ReturnType<typeof openAuthoritySession>>|undefined
 const recovery=el<HTMLSelectElement>('editor-recovery'),checkpointStatus=el('editor-checkpoint-status')
 let records:RecoveryRecord[]=[],own:RecoveryRecord|undefined,id='',timer:ReturnType<typeof setTimeout>|undefined
 let queue:Promise<void>=Promise.resolve()
 async function refreshRecovery(){
  const generation=session?.view().token.generation
  const all=await listRecoveryDrafts()
  records=all.filter(r=>{const draft=parseAuthorityDraft(r.content);return draft.generation===generation&&draft.sourceOrigin===source.value.trim()})
  recovery.replaceChildren(new Option('选择恢复草稿',''),...records.map(r=>new Option(new Date(r.updatedAt).toLocaleString()+' · Revision '+parseAuthorityDraft(r.content).revision,r.id)))
 }
 function checkpoint(){
  clearTimeout(timer);timer=undefined
  if(!session?.view().dirty)return queue
  const content=session.exportDraft(),key=id
  checkpointStatus.textContent='恢复草稿保存中…'
  queue=queue.then(async()=>{
   try{own=await writeRecoveryDraft(key,content);checkpointStatus.textContent='恢复草稿已持久化'}
   catch(error){checkpointStatus.textContent='恢复草稿保存失败：'+(error instanceof Error?error.message:String(error))}
  })
  return queue
 }
 function scheduleCheckpoint(){
  clearTimeout(timer)
  checkpointStatus.textContent='恢复草稿尚未持久化'
  timer=setTimeout(()=>void checkpoint(),700)
 }
 async function clearOwn(){
  clearTimeout(timer);timer=undefined;await queue
  if(own){await removeRecoveryDraft(own);own=undefined}
  checkpointStatus.textContent=''
 }
 function chosen(){return records.find(r=>r.id===recovery.value)}
 async function restore(content:string,recoveryId?:string){
  if(!session)return
  await session.restore(content,recoveryId)
  render();await checkpoint();await refreshRecovery()
  status.textContent='草稿已恢复；请读取并合并最新版本后确认保存。'
 }
 el('editor-checkpoint').addEventListener('click',()=>void run(async()=>{await checkpoint();await refreshRecovery()}))
 el('editor-recovery-refresh').addEventListener('click',()=>void run(refreshRecovery))
 el('editor-recovery-restore').addEventListener('click',()=>void run(async()=>{const r=chosen();if(r)await restore(r.content,r.id)}))
 el('editor-recovery-export').addEventListener('click',()=>{const r=chosen();if(r)downloadText(r.content,'application/json','inftab-recovery-draft.json')})
 el('editor-recovery-delete').addEventListener('click',()=>void run(async()=>{
  const r=chosen();if(!r||!window.confirm('仅删除此恢复草稿，不修改权威数据？'))return
  await queue;await removeRecoveryDraft(r)
  if(own?.id===r.id)own=undefined
  await refreshRecovery();status.textContent='恢复记录已删除。'
 }))
 el('editor-import').addEventListener('change',event=>void run(async()=>{
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value=''
  if(!file)return
  if(file.size>draftLimit)throw new Error('恢复草稿超过大小限制。')
  await restore(await file.text())
 }))
 function update(){
  if(!session)return
  const v=session.view()
  revision.textContent='Revision '+v.token.revision+(v.dirty?' · 未提交修改':' · 已保存')
  save.disabled=!v.dirty
 }
 function showNote(){
  const note=session?.view().draft.notes.find(n=>n.id===select.value)
  title.disabled=body.disabled=!note
  title.value=note?.title??'';body.value=note?.body??''
 }
 function render(){
  if(!session)return
  const v=session.view(),selected=select.value
  select.replaceChildren(...v.draft.notes.map(n=>new Option(n.title||'无标题',n.id)))
  if(v.draft.notes.some(n=>n.id===selected))select.value=selected
  showNote()
  todos.replaceChildren(...v.draft.todos.map(todo=>{
   const label=document.createElement('label'),box=document.createElement('input')
   box.type='checkbox';box.checked=todo.done
   box.addEventListener('change',()=>{session?.edit(s=>{const t=s.todos.find(x=>x.id===todo.id);if(t)t.done=box.checked});update();scheduleCheckpoint()})
   label.append(box,document.createTextNode(todo.title));return label
  }))
  update()
 }
 function editNote(field:'title'|'body',value:string){
  session?.edit(s=>{const note=s.notes.find(n=>n.id===select.value);if(note&&note[field]!==value){note[field]=value;note.updatedAt=Date.now()}})
  update();scheduleCheckpoint()
 }
 select.addEventListener('change',showNote)
 title.addEventListener('input',()=>editNote('title',title.value))
 body.addEventListener('input',()=>editNote('body',body.value))
 open.addEventListener('click',()=>void run(async()=>{
  if(session)return
  session=await openAuthoritySession(source.value.trim())
  id=createLocalId();own=undefined;checkpointStatus.textContent=''
  onOpen(true);section.hidden=false;open.disabled=true;render();await refreshRecovery()
  status.textContent='已从权威记录异步读取工作区。'
 }))
 save.addEventListener('click',()=>void run(async()=>{
  if(!session)return
  await checkpoint();await session.save();render();status.textContent='权威快照已提交。'
  try{await clearOwn();await refreshRecovery()}catch(error){checkpointStatus.textContent='权威数据已提交；恢复记录清理失败：'+String(error)}
 }))
 el('editor-rebase').addEventListener('click',()=>void run(async()=>{
  if(!session)return
  await checkpoint()
  const result=await session.rebase()
  if(result.conflicts.length){status.textContent='存在冲突，保留未提交修改：'+result.conflicts.slice(0,20).map(c=>c.path+' '+c.reason).join('；');return}
  render();if(session.view().dirty)await checkpoint();else await clearOwn()
  status.textContent='已读取最新版本；未提交修改仍需确认保存。'
 }))
 el('editor-download').addEventListener('click',()=>{if(session)downloadText(session.exportDraft(),'application/json','inftab-authority-draft.json')})
 el('editor-close').addEventListener('click',()=>void run(async()=>{
  if(session?.view().dirty&&!window.confirm('存在未提交修改。确认放弃？可先导出草稿。'))return
  await clearOwn()
  session=undefined;section.hidden=true;open.disabled=true;onOpen(false)
  status.textContent='编辑会话已关闭，请重新读取目标记录。'
 }))
 window.addEventListener('pagehide',()=>{if(session?.view().dirty)void checkpoint()})
 window.addEventListener('beforeunload',event=>{if(session?.view().dirty){event.preventDefault();event.returnValue=''}})
 return {setAvailable(available:boolean){open.disabled=!available||!!session}}
}
