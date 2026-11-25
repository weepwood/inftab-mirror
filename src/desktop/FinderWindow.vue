<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue'
import WindowFrame from './WindowFrame.vue'
import { Folder, Grid2X2, List, Search, ArrowUpRight } from '@lucide/vue'
import type {LauncherItem} from '../types'
import type {FinderClipboard} from './ownership'
import { folderParents, folderDescendants } from '../data/folderTree'
import type {HomeWorkspace} from '../data/homeWorkspaces'
const props=defineProps<{items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; folderId?:string; dark?:boolean; active:boolean; minimized:boolean; maximized:boolean; cascade:number; layer:number; hidden?:boolean; clipboard?:FinderClipboard; pasting?:boolean; browseWorkspaceId?:string; browseFolderId?:string; history:{undo:boolean;redo:boolean}}>()
const emit=defineEmits<{close:[];open:[item:LauncherItem,event?:MouseEvent];edit:[item:LauncherItem];remove:[item:LauncherItem];move:[ids:string[],id:string];membership:[ids:string[],folderId:string|null];create:[workspaceId:string,parentId?:string];activate:[];minimize:[];maximize:[];title:[title:string]; clipboard:[value:FinderClipboard]; paste:[workspaceId:string,folderId:string|null]; location:[workspaceId:string,folderId:string|undefined];historyAction:[kind:'undo'|'redo'];reparent:[ids:string[],workspaceId:string,folderId:string|null]}>()
const search=ref('')
const itemGrid=ref<HTMLElement>(), focusId=ref<string>()
const currentSpace=ref(props.browseWorkspaceId??props.workspaceId), currentFolder=ref((props.browseWorkspaceId?props.browseFolderId:props.folderId)??'')
const list=ref(false), selected=ref<string[]>([])
const back=ref<{workspaceId:string;folderId:string}[]>([])
const forward=ref<{workspaceId:string;folderId:string}[]>([])
const order=ref<'default'|'name'|'type'>('default')
const anchor=ref<string>()
const dropTarget=ref<string>()
const inspector=ref(false)
const body=ref<HTMLElement>(), menuRoot=ref<HTMLElement>()
const contextMenu=ref<{x:number;y:number}>()
let returnFocus:HTMLElement|undefined
const space=computed(()=>props.workspaces.find(w=>w.id===currentSpace.value))
const folders=computed(()=>props.items.filter(i=>i.folder&&space.value?.itemIds.includes(i.id)))
const parents=computed(()=>folderParents(folders.value.flatMap(i=>i.folder?[i.folder]:[]),space.value))
const roots=computed(()=>folders.value.filter(f=>!parents.value.has(f.id)))
const breadcrumbs=computed(()=>{
 const result:LauncherItem[]=[]
 let id=currentFolder.value
 while(id){const item=folders.value.find(f=>f.id===id);if(!item)break;result.unshift(item);id=parents.value.get(id)??''}
 return result
})
const folder=computed(()=>folders.value.find(i=>i.id===currentFolder.value))
const visible=computed(()=>{
 const members=new Set(folder.value?.folder?.shortcutIds??[])
 const hidden=new Set(folders.value.flatMap(i=>i.folder!.shortcutIds))
 const matches=props.items.filter(i=>space.value?.itemIds.includes(i.id)&&!i.action&&(i.folder?(parents.value.get(i.id)??'')===currentFolder.value:currentFolder.value?members.has(i.id):!hidden.has(i.id))&&(i.title+' '+(i.shortcut?.url??'')).toLocaleLowerCase().includes(search.value.toLocaleLowerCase().trim()))
 if(order.value==='name')matches.sort((a,b)=>a.title.localeCompare(b.title))
 if(order.value==='type')matches.sort((a,b)=>Number(!!b.folder)-Number(!!a.folder)||a.title.localeCompare(b.title))
 return matches
})
function location(){return {workspaceId:currentSpace.value,folderId:currentFolder.value}}
function applyLocation(id:string,folderId=''){contextMenu.value=undefined;currentSpace.value=id;currentFolder.value=folderId;selected.value=[];anchor.value=undefined;focusId.value=undefined;search.value=''}
function navigate(id:string,folderId=''){
 if(id===currentSpace.value&&folderId===currentFolder.value)return
 back.value=[...back.value.slice(-49),location()];forward.value=[];applyLocation(id,folderId)
}
function traverse(direction:'back'|'forward'){
 const source=direction==='back'?back:forward,target=direction==='back'?forward:back
 while(source.value.length){
  const next=source.value.pop()!
  const workspace=props.workspaces.find(w=>w.id===next.workspaceId)
  if(!workspace||(next.folderId&&(!workspace.itemIds.includes(next.folderId)||!props.items.some(i=>i.id===next.folderId&&i.folder))))continue
  target.value=[...target.value.slice(-49),location()];applyLocation(next.workspaceId,next.folderId);return
 }
}
function select(item:LauncherItem,event:MouseEvent){
 focusId.value=item.id
 const from=visible.value.findIndex(i=>i.id===anchor.value),to=visible.value.findIndex(i=>i.id===item.id)
 if(event.shiftKey&&from>=0&&to>=0){selected.value=visible.value.slice(Math.min(from,to),Math.max(from,to)+1).map(i=>i.id);return}
 selected.value=event.metaKey||event.ctrlKey?selected.value.includes(item.id)?selected.value.filter(id=>id!==item.id):[...selected.value,item.id]:[item.id]
 anchor.value=item.id
}
function startDrag(item:LauncherItem,event:DragEvent){
 if(!event.dataTransfer)return
 const ids=selected.value.includes(item.id)?selectedItems.value.map(i=>i.id):[item.id]
 if(!ids.every(id=>props.items.some(i=>i.id===id&&i.shortcut))){event.preventDefault();return}
 event.dataTransfer.setData('application/x-inftab-shortcuts',JSON.stringify(ids))
 event.dataTransfer.effectAllowed='move'
}
function dragOver(id:string,event:DragEvent){
 if(!event.dataTransfer?.types.includes('application/x-inftab-shortcuts'))return
 event.preventDefault();event.dataTransfer.dropEffect='move';dropTarget.value=id
}
function drop(id:string,event:DragEvent){
 dropTarget.value=undefined
 if(!event.dataTransfer?.types.includes('application/x-inftab-shortcuts'))return
 event.preventDefault()
 try{const ids:unknown=JSON.parse(event.dataTransfer.getData('application/x-inftab-shortcuts'))
 if(Array.isArray(ids)&&ids.length&&ids.length<=500&&ids.every(i=>typeof i==='string'))emit('membership',ids,id)
 }catch{/* malformed payload */}
}
function clearDrop(){dropTarget.value=undefined}
function open(item:LauncherItem,event?:MouseEvent){if(item.folder)navigate(currentSpace.value,item.id);else emit('open',item,event)}
const selectedItems=computed(()=>visible.value.filter(i=>selected.value.includes(i.id)))
watch([currentSpace,currentFolder],([id,folderId])=>emit('location',id,folderId||undefined))
watch(()=>folder.value?.title??space.value?.name??'Finder', title=>emit('title',title),{immediate:true})
watch(visible,items=>{selected.value=selected.value.filter(id=>items.some(i=>i.id===id));if(!items.some(i=>i.id===focusId.value))focusId.value=items[0]?.id},{immediate:true})
watch([space,folder],([workspace,current])=>{
 if(!workspace)navigate(props.workspaces.find(w=>w.id===props.workspaceId)?.id??props.workspaces[0]?.id??'')
 else if(currentFolder.value&&!current)applyLocation(workspace.id)
})
function copySelection(mode:'cut'|'copy'){
 if(!selectedItems.value.length||!selectedItems.value.every(i=>i.shortcut))return
 emit('clipboard',{mode,ids:selectedItems.value.map(i=>i.id),workspaceId:currentSpace.value,folderId:currentFolder.value||null})
}
function pasteSelection(){if(props.clipboard&&!props.pasting)emit('paste',currentSpace.value,currentFolder.value||null)}
async function navigateKey(e:KeyboardEvent){
 const key=e.key
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End',' '].includes(key))return
 const items=visible.value
 if(!items.length)return
 e.preventDefault();e.stopPropagation()
 const index=Math.max(0,items.findIndex(i=>i.id===focusId.value))
 if(key===' '){const id=items[index]!.id;selected.value=selected.value.includes(id)?selected.value.filter(i=>i!==id):[...selected.value,id];anchor.value=id;return}
 const buttons=[...(itemGrid.value?.querySelectorAll<HTMLButtonElement>('button[data-finder-id]')??[])]
 const first=buttons[0]
 const cols=list.value?1:Math.max(1,buttons.findIndex(b=>b.offsetTop!==first?.offsetTop)===-1?buttons.length:buttons.findIndex(b=>b.offsetTop!==first?.offsetTop))
 const delta=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowUp'?-cols:cols
 const next=key==='Home'?0:key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+delta))
 const item=items[next]!
 if(e.shiftKey){const start=Math.max(0,items.findIndex(i=>i.id===(anchor.value??items[index]?.id)));anchor.value=items[start]?.id;selected.value=items.slice(Math.min(start,next),Math.max(start,next)+1).map(i=>i.id)}
 else if(!e.ctrlKey&&!e.metaKey){selected.value=[item.id];anchor.value=item.id}
 focusId.value=item.id
 await nextTick()
 buttons[next]?.focus()
}
function closeMenu(restore=false){
 contextMenu.value=undefined
 if(restore)void nextTick(()=>{if(returnFocus?.isConnected)returnFocus.focus()})
}
watch(()=>props.active&&!props.hidden&&!props.minimized,active=>{if(!active)closeMenu()})
async function showMenu(event:MouseEvent|KeyboardEvent,item?:LauncherItem){
 event.preventDefault();event.stopPropagation()
 if(item&&!selected.value.includes(item.id)){selected.value=[item.id];anchor.value=item.id;focusId.value=item.id}
 if(!item)selected.value=[]
 returnFocus=event.currentTarget instanceof HTMLElement?event.currentTarget:undefined
 const bounds=body.value?.getBoundingClientRect()
 if(!bounds)return
 const target=returnFocus?.getBoundingClientRect()
 const x=event instanceof MouseEvent?event.clientX:target?.left??bounds.left
 const y=event instanceof MouseEvent?event.clientY:target?.bottom??bounds.top
 contextMenu.value={x:Math.max(4,x-bounds.left),y:Math.max(4,y-bounds.top)}
 await nextTick()
 const menu=menuRoot.value
 if(!menu||!contextMenu.value)return
 contextMenu.value={x:Math.max(4,Math.min(contextMenu.value.x,bounds.width-menu.offsetWidth-4)),y:Math.max(4,Math.min(contextMenu.value.y,bounds.height-menu.offsetHeight-4))}
 menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}
function menuAction(action:()=>void){closeMenu();action()}
function menuKeys(e:KeyboardEvent){
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);return}
 if(e.key==='Tab'){closeMenu();return}
 if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return
 e.preventDefault();e.stopPropagation()
 const buttons=[...(menuRoot.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])]
 if(!buttons.length)return
 const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
 buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus()
}
function keys(e:KeyboardEvent){
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return
 if(e.ctrlKey||e.metaKey){
  const key=e.key.toLowerCase()
  if(key==='z'||key==='y'){e.preventDefault();emit('historyAction',key==='y'||e.shiftKey?'redo':'undo');return}
  if(key==='x'||key==='c'){e.preventDefault();copySelection(key==='x'?'cut':'copy');return}
  if(key==='v'){e.preventDefault();pasteSelection();return}
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selected.value=visible.value.map(i=>i.id);return}
 if(e.key==='Enter'&&e.target instanceof HTMLElement&&e.target.classList.contains('window-frame')&&selectedItems.value.length===1){e.preventDefault();open(selectedItems.value[0]!)}
}
</script>
<template>
 <WindowFrame kind="finder" :title="folder?.title??space?.name??'Finder'" description="Finder" label="Finder 入口管理" :geometry-key="'finder:'+workspaceId+':'+(folderId??'')" :active="active" :minimized="minimized" :maximized="maximized" :cascade="cascade" :layer="layer" :dark="dark" :hidden="hidden" @activate="emit('activate')" @close="emit('close')" @minimize="emit('minimize')" @maximize="emit('maximize')" @keydown="keys">
  <div ref="body" class="finder-body" @pointerdown.capture="!menuRoot?.contains($event.target as Node)&&closeMenu()">
   <aside><small>工作区</small><button v-for="w in workspaces" :key="w.id" :class="{active:currentSpace===w.id&&!currentFolder}" @click="navigate(w.id)"><Grid2X2 :size="16"/>{{w.name}}</button><small>文件夹</small><button v-for="f in roots" :key="f.id" :class="{active:currentFolder===f.id,'drop-target':dropTarget===f.id}" @dragover="dragOver(f.id,$event)" @dragleave="clearDrop" @drop="drop(f.id,$event)" @click="navigate(currentSpace,f.id)"><Folder :size="17"/>{{f.title}}</button></aside>
   <main><nav><button aria-label="撤销操作" :disabled="!history.undo" @click="emit('historyAction','undo')">↶</button><button aria-label="重做操作" :disabled="!history.redo" @click="emit('historyAction','redo')">↷</button><button aria-label="返回" :disabled="!back.length" @click="traverse('back')">‹</button><button aria-label="前进" :disabled="!forward.length" @click="traverse('forward')">›</button><button @click="emit('create',currentSpace,currentFolder||undefined)">新建文件夹</button><button :aria-pressed="!list" aria-label="图标视图" @click="list=false"><Grid2X2 :size="17"/></button><button :aria-pressed="list" aria-label="列表视图" @click="list=true"><List :size="17"/></button><select v-model="order" aria-label="排序入口"><option value="default">默认顺序</option><option value="name">名称</option><option value="type">类型</option></select><label><Search :size="15"/><input v-model="search" placeholder="搜索入口" aria-label="搜索 Finder"/></label></nav>
    <div v-if="breadcrumbs.length" class="finder-breadcrumb"><button :aria-label="'路径：'+space?.name" @click="navigate(currentSpace)">{{space?.name}}</button><template v-for="crumb in breadcrumbs" :key="crumb.id"><span>/</span><button :aria-label="'路径：'+crumb.title" @click="navigate(currentSpace,crumb.id)">{{crumb.title}}</button></template></div>
    <div ref="itemGrid" class="finder-items" :class="{list}" @contextmenu.self="showMenu($event)" @keydown="navigateKey"><button v-for="item in visible" :key="item.id" :data-finder-id="item.id" :tabindex="focusId===item.id?0:-1" @focus="focusId=item.id" :aria-pressed="selected.includes(item.id)" :draggable="!!item.shortcut" :class="{'drop-target':dropTarget===item.id}" @dragstart="startDrag(item,$event)" @dragend="clearDrop" @dragover="item.folder&&dragOver(item.id,$event)" @dragleave="clearDrop" @drop="item.folder&&drop(item.id,$event)" @click="select(item,$event)" @dblclick="open(item,$event)" @keydown.enter.stop.prevent="open(item)" @contextmenu="showMenu($event,item)" @keydown.shift.f10="showMenu($event,item)" @keydown.context-menu="showMenu($event,item)"><Folder v-if="item.folder" :size="40" fill="#65baf0" color="#258acb"/><img v-else-if="item.icon" :src="item.icon" alt=""/><span v-else class="mark" :style="{background:item.color}">{{item.mark}}</span><span>{{item.title}}</span><span v-if="list" class="finder-type">{{item.folder?'文件夹':'快捷入口'}}</span></button><p v-if="!visible.length">没有入口</p></div>
    <section v-if="inspector&&selectedItems.length===1" class="finder-inspector" aria-label="入口详情">
     <strong>{{selectedItems[0]?.title}}</strong><span>{{selectedItems[0]?.shortcut?.url??((selectedItems[0]?.folder?.shortcutIds.length??0)+' 个入口')}}</span>
    </section>
    <footer><span>{{visible.length}} 项 · 已选 {{selectedItems.length}} 项</span><template v-if="selectedItems.length===1"><button @click="open(selectedItems[0]!)"><ArrowUpRight :size="14"/>打开</button><button @click="emit('edit',selectedItems[0]!)">编辑</button><button :aria-pressed="inspector" @click="inspector=!inspector">详情</button><button @click="emit('remove',selectedItems[0]!)">删除</button></template><template v-if="selectedItems.length&&selectedItems.every(i=>i.shortcut)"><button @click="copySelection('cut')">剪切</button><button @click="copySelection('copy')">复制</button></template><button v-if="clipboard" :disabled="pasting" @click="pasteSelection">粘贴 {{clipboard.ids.length}} 项</button><select v-if="selectedItems.length" aria-label="移动到工作区" value="" @change="emit('move',selectedItems.map(i=>i.id),($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="" disabled>移动到…</option><option v-for="w in workspaces.filter(w=>w.id!==currentSpace)" :key="w.id" :value="w.id">{{w.name}}</option></select><select v-if="selectedItems.length&&selectedItems.every(i=>i.folder)" aria-label="移动文件夹到" value="" @change="emit('reparent',selectedItems.map(i=>i.id),currentSpace,($event.target as HTMLSelectElement).value==='__root'?null:($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="" disabled>移动目录…</option><option value="__root">根目录</option><option v-for="f in folders.filter(f=>!selected.includes(f.id)&&!selected.some(id=>folderDescendants(id,parents).includes(f.id)))" :key="f.id" :value="f.id">{{f.title}}</option></select><select v-if="selectedItems.length&&selectedItems.every(i=>i.shortcut)" aria-label="移动到文件夹" value="" @change="emit('membership',selectedItems.map(i=>i.id),($event.target as HTMLSelectElement).value==='__root'?null:($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="" disabled>文件夹…</option><option value="__root">移出文件夹</option><option v-for="f in folders.filter(f=>f.id!==currentFolder)" :key="f.id" :value="f.id">{{f.title}}</option></select></footer>
   </main>
   <div v-if="contextMenu" ref="menuRoot" class="finder-context" role="menu" aria-label="Finder 操作菜单" :style="{left:contextMenu.x+'px',top:contextMenu.y+'px'}" @keydown="menuKeys">
    <template v-if="selectedItems.length===1"><button role="menuitem" @click="menuAction(()=>open(selectedItems[0]!))">打开</button><button role="menuitem" @click="menuAction(()=>emit('edit',selectedItems[0]!))">编辑</button><button role="menuitem" @click="menuAction(()=>inspector=true)">显示详情</button></template>
    <template v-if="selectedItems.length&&selectedItems.every(i=>i.shortcut)"><button role="menuitem" @click="menuAction(()=>copySelection('cut'))">剪切 <small>⌘ X</small></button><button role="menuitem" @click="menuAction(()=>copySelection('copy'))">复制 <small>⌘ C</small></button></template>
    <button role="menuitem" :disabled="!clipboard||pasting" @click="menuAction(pasteSelection)">粘贴 <small>⌘ V</small></button>
    <button role="menuitem" :disabled="!history.undo" @click="menuAction(()=>emit('historyAction','undo'))">撤销</button><button role="menuitem" :disabled="!history.redo" @click="menuAction(()=>emit('historyAction','redo'))">重做</button>
    <button role="menuitem" @click="menuAction(()=>emit('create',currentSpace,currentFolder||undefined))">新建文件夹</button>
    <button v-if="selectedItems.length===1" role="menuitem" class="danger" @click="menuAction(()=>emit('remove',selectedItems[0]!))">删除</button>
   </div>
  </div>
 </WindowFrame>
</template>
<style scoped>
.finder nav button[aria-pressed=true]{background:#589cff33;border-color:#589cff70}.finder button:focus-visible,.finder select:focus-visible,.finder input:focus-visible{outline:2px solid #599ffa;outline-offset:2px}
.finder-inspector{display:flex;gap:8px;align-items:center;min-width:0;border-top:1px solid #8883;padding:8px 12px}.finder-inspector span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.7}.finder-body{position:relative;display:flex;flex:1;min-height:0}.finder aside{width:180px;flex-shrink:0;background:#8881;padding:12px 8px;overflow:auto}.finder aside small{display:block;margin:12px 8px 4px;opacity:.6}.finder button{font:inherit;color:inherit;cursor:pointer}.finder aside button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:7px 9px;text-align:left;border-radius:6px}.finder aside button.active{background:#589cff33;color:inherit}
.finder main{display:flex;flex:1;flex-direction:column;min-width:0}.finder nav,.finder footer{display:flex;align-items:center;gap:6px;padding:9px;border-bottom:1px solid #8883;flex-wrap:wrap}.finder nav button,.finder footer button,.finder select{border:1px solid #8883;border-radius:6px;background:#8881;padding:5px 8px;display:inline-flex;align-items:center;gap:4px;color:inherit}.finder nav label{display:flex;align-items:center;gap:6px;margin-left:auto}.finder input{width:110px;border:1px solid #8883;border-radius:6px;padding:5px;background:transparent;color:inherit}
.finder-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));align-content:start;gap:6px;overflow:auto;flex:1;padding:14px}.finder-items button{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:0;border-radius:7px;padding:8px;min-width:0}.finder-items button[aria-pressed=true]{background:#589cff40}.finder-items button span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.finder-items img,.mark{width:40px;height:40px;object-fit:contain;border-radius:8px}.mark{display:grid;place-items:center;color:white}.finder-items.list{display:flex;flex-direction:column}.finder-items.list button{flex-direction:row;gap:12px}.finder-type{margin-left:auto;opacity:.65;font-size:12px}.finder-items.list button:nth-child(2n){background:#8881}.finder-items.list button[aria-pressed=true]{background:#589cff40}.finder footer{border-top:1px solid #8883;border-bottom:0;font-size:12px}.finder footer>span{margin-right:auto}.finder-restore{position:fixed;z-index:16;bottom:85px;left:24px;padding:9px 16px;border-radius:10px;background:#333c;color:white;border:1px solid #fff4}
 .finder{pointer-events:auto}.finder .drop-target{outline:2px solid #589cff;outline-offset:-2px;background:#589cff28}.finder nav button:disabled{opacity:.4;cursor:default}.finder nav select{max-width:110px}.finder-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.finder-items button span{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:600px){.finder aside{width:90px}.finder nav label{margin-left:0}.finder nav{padding:6px;gap:4px}.finder-items{padding:8px;grid-template-columns:repeat(auto-fill,minmax(76px,1fr))}}
@media(prefers-reduced-motion:no-preference){.finder{animation:finder-in .16s ease-out}@keyframes finder-in{from{opacity:0}to{opacity:1}}}
.finder-breadcrumb{display:flex;gap:5px;align-items:center;padding:5px 10px;overflow:auto;border-bottom:1px solid #8882}.finder-breadcrumb button{border:0;background:none;color:inherit;white-space:nowrap;padding:3px 5px;border-radius:4px}.finder-breadcrumb button:hover{background:#589cff33}.finder-context{position:absolute;z-index:4;width:174px;max-width:calc(100% - 8px);max-height:calc(100% - 8px);overflow:auto;padding:5px;box-sizing:border-box;background:var(--ui-surface);color:var(--ui-text);border:1px solid var(--ui-border);border-radius:9px;box-shadow:0 12px 32px #0005}.finder-context button{display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 8px;border:0;background:none;border-radius:5px;text-align:left}.finder-context button:not(:disabled):hover,.finder-context button:focus-visible{background:var(--ui-accent-soft);color:var(--ui-accent-text)}.finder-context button:disabled{opacity:.4;cursor:default}.finder-context small{font-size:10px;opacity:.65}.finder-context .danger{color:var(--ui-danger)}
</style>
