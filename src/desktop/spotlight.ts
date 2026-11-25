import type { LauncherItem, Note, TodoItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'

export interface SpotlightResult {id:string;label:string;detail:string}
export function searchDesktopRecords(query:string, data:{items:LauncherItem[];workspaces:HomeWorkspace[];notes:Note[];todos:TodoItem[]}):SpotlightResult[]{
 const terms=query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
 if(!terms.length)return []
 const results:{result:SpotlightResult;score:number}[]=[]
 function add(id:string,label:string,detail:string,body=''){
  const name=label.normalize('NFKC').toLocaleLowerCase(),text=(name+' '+body+' '+detail).normalize('NFKC').toLocaleLowerCase()
  if(!terms.every(t=>text.includes(t)))return
  results.push({result:{id,label,detail},score:terms.reduce((sum,t)=>sum+(name===t?8:name.startsWith(t)?4:name.includes(t)?2:0),0)})
 }
 for(const item of data.items)if(!item.action)add('record:item:'+item.id,item.title,item.folder?'文件夹':'快捷入口',item.shortcut?.url)
 for(const workspace of data.workspaces)add('record:workspace:'+workspace.id,workspace.name,'工作区')
 for(const note of data.notes)add('record:note:'+note.id,note.title||'未命名笔记','笔记',note.body)
 for(const todo of data.todos)add('record:todo:'+todo.id,todo.title,todo.done?'已完成待办':'待办事项')
 return results.sort((a,b)=>b.score-a.score||a.result.label.localeCompare(b.result.label)).slice(0,40).map(item=>item.result)
}
