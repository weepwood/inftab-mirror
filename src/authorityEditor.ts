import { openAuthoritySession } from './data/authoritySession'
import { downloadText } from './data/downloadBackup'
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
export function bindAuthorityEditor(source:HTMLInputElement,run:(action:()=>Promise<void>)=>Promise<void>,onOpen:(opened:boolean)=>void,status:HTMLElement){
 const section=el('authority-editor'),open=el<HTMLButtonElement>('open-editor')
 const select=el<HTMLSelectElement>('editor-note'),title=el<HTMLInputElement>('editor-title'),body=el<HTMLTextAreaElement>('editor-body'),todos=el('editor-todos'),revision=el('editor-revision')
 const save=el<HTMLButtonElement>('editor-save')
 let session:Awaited<ReturnType<typeof openAuthoritySession>>|undefined
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
   box.addEventListener('change',()=>{session?.edit(s=>{const t=s.todos.find(x=>x.id===todo.id);if(t)t.done=box.checked});update()})
   label.append(box,document.createTextNode(todo.title));return label
  }))
  update()
 }
 function editNote(field:'title'|'body',value:string){
  session?.edit(s=>{const note=s.notes.find(n=>n.id===select.value);if(note&&note[field]!==value){note[field]=value;note.updatedAt=Date.now()}})
  update()
 }
 select.addEventListener('change',showNote)
 title.addEventListener('input',()=>editNote('title',title.value))
 body.addEventListener('input',()=>editNote('body',body.value))
 open.addEventListener('click',()=>void run(async()=>{
  if(session)return
  session=await openAuthoritySession(source.value.trim())
  onOpen(true);section.hidden=false;open.disabled=true;render()
  status.textContent='已从权威记录异步读取工作区。'
 }))
 save.addEventListener('click',()=>void run(async()=>{
  if(!session)return
  await session.save();render();status.textContent='权威快照已提交。'
 }))
 el('editor-rebase').addEventListener('click',()=>void run(async()=>{
  if(!session)return
  const result=await session.rebase()
  if(result.conflicts.length){status.textContent='存在冲突，保留未提交修改：'+result.conflicts.slice(0,20).map(c=>c.path+' '+c.reason).join('；');return}
  render();status.textContent='已读取最新版本；未提交修改仍需确认保存。'
 }))
 el('editor-download').addEventListener('click',()=>{if(session)downloadText(session.exportDraft(),'application/json','inftab-authority-draft.json')})
 el('editor-close').addEventListener('click',()=>void run(async()=>{
  if(session?.view().dirty&&!window.confirm('存在未提交修改。确认放弃？可先导出草稿。'))return
  session=undefined;section.hidden=true;open.disabled=true;onOpen(false)
  status.textContent='编辑会话已关闭，请重新读取目标记录。'
 }))
 window.addEventListener('beforeunload',event=>{if(session?.view().dirty){event.preventDefault();event.returnValue=''}})
 return {setAvailable(available:boolean){open.disabled=!available||!!session}}
}
