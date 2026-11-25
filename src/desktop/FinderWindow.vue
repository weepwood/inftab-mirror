<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,nextTick,watch} from 'vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/auto-start'
import { Folder, Grid2X2, List, Search, ArrowUpRight } from '@lucide/vue'
import type {LauncherItem} from '../types'
import type {HomeWorkspace} from '../data/homeWorkspaces'
const props=defineProps<{items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; folderId?:string; dark?:boolean}>()
const emit=defineEmits<{close:[];open:[item:LauncherItem,event?:MouseEvent];edit:[item:LauncherItem];remove:[item:LauncherItem];move:[item:LauncherItem,id:string];membership:[item:LauncherItem,folderId:string|null];create:[workspaceId:string]}>()
const root=ref<HTMLElement>(), titlebar=ref<HTMLElement>(), search=ref('')
const currentSpace=ref(props.workspaceId), currentFolder=ref(props.folderId??'')
const minimized=ref(false), maximized=ref(false), list=ref(false), selected=ref<string[]>([])
const offset=ref({x:0,y:0})
const space=computed(()=>props.workspaces.find(w=>w.id===currentSpace.value))
const folders=computed(()=>props.items.filter(i=>i.folder&&space.value?.itemIds.includes(i.id)))
const folder=computed(()=>folders.value.find(i=>i.id===currentFolder.value))
const visible=computed(()=>{
 const members=new Set(folder.value?.folder?.shortcutIds??[])
 const hidden=new Set(folders.value.flatMap(i=>i.folder!.shortcutIds))
 return props.items.filter(i=>space.value?.itemIds.includes(i.id)&&!i.action&&(currentFolder.value?members.has(i.id):!hidden.has(i.id))&&i.title.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))
})
function navigate(id:string,folderId=''){currentSpace.value=id;currentFolder.value=folderId;selected.value=[];search.value=''}
function select(item:LauncherItem,event:MouseEvent){selected.value=event.metaKey||event.ctrlKey?selected.value.includes(item.id)?selected.value.filter(id=>id!==item.id):[...selected.value,item.id]:[item.id]}
function open(item:LauncherItem,event?:MouseEvent){if(item.folder)navigate(currentSpace.value,item.id);else emit('open',item,event)}
const selectedItems=computed(()=>visible.value.filter(i=>selected.value.includes(i.id)))
let binding:ReturnType<typeof interact>|undefined
let previousFocus:HTMLElement|undefined
onMounted(async()=>{
 previousFocus=document.activeElement as HTMLElement
 await nextTick();root.value?.focus()
 if(titlebar.value)binding=interact(titlebar.value).draggable({ignoreFrom:'button',listeners:{move(e){
 const r=root.value?.getBoundingClientRect();if(!r||maximized.value)return
 offset.value={x:offset.value.x+Math.max(48-r.right,Math.min(innerWidth-48-r.left,e.dx)),y:offset.value.y+Math.max(-r.top,Math.min(innerHeight-48-r.top,e.dy))}
 }}})
})
function constrain(){const r=root.value?.getBoundingClientRect();if(!r||minimized.value)return;offset.value={x:offset.value.x+Math.max(48-r.right,Math.min(innerWidth-48-r.left,0)),y:offset.value.y+Math.max(-r.top,Math.min(innerHeight-48-r.top,0))}}
onMounted(()=>window.addEventListener('resize',constrain))
watch(minimized,async v=>{if(!v){await nextTick();constrain();root.value?.focus()}})
watch(visible,items=>{selected.value=selected.value.filter(id=>items.some(i=>i.id===id))})
watch([space,folder],([workspace,current])=>{
 if(!workspace)navigate(props.workspaces.find(w=>w.id===props.workspaceId)?.id??props.workspaces[0]?.id??'')
 else if(currentFolder.value&&!current)navigate(workspace.id)
})
onBeforeUnmount(()=>{window.removeEventListener('resize',constrain);binding?.unset();if(previousFocus?.isConnected)previousFocus.focus()})
function keys(e:KeyboardEvent){if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selected.value=visible.value.map(i=>i.id);return}if(e.key==='Escape'){e.stopPropagation();emit('close')}else if(e.key==='Enter'&&e.target===root.value&&selectedItems.value.length===1)open(selectedItems.value[0]!)}
</script>
<template>
 <section v-show="!minimized" ref="root" class="finder" :class="{dark,maximized}" :style="{transform:'translate('+offset.x+'px,'+offset.y+'px)'}" role="dialog" aria-label="Finder 入口管理" tabindex="-1" @keydown="keys">
  <header ref="titlebar" class="finder-title"><div class="lights"><button class="close" aria-label="关闭 Finder" @click="emit('close')"/><button class="minimize" aria-label="最小化 Finder" @click="minimized=true"/><button class="maximize" :aria-label="maximized?'还原 Finder':'最大化 Finder'" @click="maximized=!maximized;offset={x:0,y:0}"/></div><strong>{{folder?.title??space?.name??'Finder'}}</strong><span>Finder</span></header>
  <div class="finder-body">
   <aside><small>工作区</small><button v-for="w in workspaces" :key="w.id" :class="{active:currentSpace===w.id&&!currentFolder}" @click="navigate(w.id)"><Grid2X2 :size="16"/>{{w.name}}</button><small>文件夹</small><button v-for="f in folders" :key="f.id" :class="{active:currentFolder===f.id}" @click="navigate(currentSpace,f.id)"><Folder :size="17"/>{{f.title}}</button></aside>
   <main><nav><button @click="emit('create',currentSpace)">新建文件夹</button><button :aria-pressed="!list" aria-label="图标视图" @click="list=false"><Grid2X2 :size="17"/></button><button :aria-pressed="list" aria-label="列表视图" @click="list=true"><List :size="17"/></button><label><Search :size="15"/><input v-model="search" placeholder="搜索入口" aria-label="搜索 Finder"/></label></nav>
    <div class="finder-items" :class="{list}"><button v-for="item in visible" :key="item.id" :aria-pressed="selected.includes(item.id)" @click="select(item,$event)" @dblclick="open(item,$event)" @keydown.enter.stop="open(item)"><Folder v-if="item.folder" :size="40" fill="#65baf0" color="#258acb"/><img v-else-if="item.icon" :src="item.icon" alt=""/><span v-else class="mark" :style="{background:item.color}">{{item.mark}}</span><span>{{item.title}}</span><span v-if="list" class="finder-type">{{item.folder?'文件夹':'快捷入口'}}</span></button><p v-if="!visible.length">没有入口</p></div>
    <footer><span>{{visible.length}} 项 · 已选 {{selectedItems.length}} 项</span><template v-if="selectedItems.length===1"><button @click="open(selectedItems[0]!)"><ArrowUpRight :size="14"/>打开</button><button @click="emit('edit',selectedItems[0]!)">编辑</button><button @click="emit('remove',selectedItems[0]!)">删除</button></template><select v-if="selectedItems.length" aria-label="移动到工作区" value="" @change="[...selectedItems].forEach(i=>emit('move',i,($event.target as HTMLSelectElement).value));selected=[]"><option value="" disabled>移动到…</option><option v-for="w in workspaces.filter(w=>w.id!==currentSpace)" :key="w.id" :value="w.id">{{w.name}}</option></select><select v-if="selectedItems.length&&selectedItems.every(i=>i.shortcut)" aria-label="移动到文件夹" value="" @change="[...selectedItems].forEach(i=>emit('membership',i,($event.target as HTMLSelectElement).value==='__root'?null:($event.target as HTMLSelectElement).value));selected=[]"><option value="" disabled>文件夹…</option><option value="__root">移出文件夹</option><option v-for="f in folders.filter(f=>f.id!==currentFolder)" :key="f.id" :value="f.id">{{f.title}}</option></select></footer>
   </main>
  </div>
 </section>
 <button v-if="minimized" class="finder-restore" @click="minimized=false">恢复 Finder</button>
</template>
<style scoped>
.finder{position:fixed;z-index:9;top:12vh;left:max(12px,calc((100vw - 850px)/2));width:min(850px,calc(100vw - 24px));height:min(570px,76vh);display:flex;flex-direction:column;color:#25282e;background:#f9f9fbeF;border:1px solid #fff9;border-radius:13px;box-shadow:0 28px 90px #0006;overflow:hidden;backdrop-filter:blur(26px);font:13px system-ui,sans-serif}
.finder.dark{background:#25272cf5;color:#eee;border-color:#ffffff25}
.finder-title{display:flex;align-items:center;gap:18px;padding:12px 16px;border-bottom:1px solid #8883;touch-action:none;cursor:grab}.finder-title>span{margin-left:auto;opacity:.55}.lights{display:flex;gap:8px}.lights button{width:12px;height:12px;border-radius:50%;border:0;cursor:pointer}.close{background:#ff5f57}.minimize{background:#febc2e}.maximize{background:#28c840}.finder.maximized{inset:80px 12px 60px;width:auto;height:auto;transform:none!important}.finder nav button[aria-pressed=true]{background:#589cff33;border-color:#589cff70}.finder button:focus-visible,.finder select:focus-visible,.finder input:focus-visible{outline:2px solid #599ffa;outline-offset:2px}
.finder-body{display:flex;flex:1;min-height:0}.finder aside{width:180px;flex-shrink:0;background:#8881;padding:12px 8px;overflow:auto}.finder aside small{display:block;margin:12px 8px 4px;opacity:.6}.finder button{font:inherit;color:inherit;cursor:pointer}.finder aside button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:7px 9px;text-align:left;border-radius:6px}.finder aside button.active{background:#589cff33;color:inherit}
.finder main{display:flex;flex:1;flex-direction:column;min-width:0}.finder nav,.finder footer{display:flex;align-items:center;gap:6px;padding:9px;border-bottom:1px solid #8883;flex-wrap:wrap}.finder nav button,.finder footer button,.finder select{border:1px solid #8883;border-radius:6px;background:#8881;padding:5px 8px;display:inline-flex;align-items:center;gap:4px;color:inherit}.finder nav label{display:flex;align-items:center;gap:6px;margin-left:auto}.finder input{width:110px;border:1px solid #8883;border-radius:6px;padding:5px;background:transparent;color:inherit}
.finder-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));align-content:start;gap:6px;overflow:auto;flex:1;padding:14px}.finder-items button{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:0;border-radius:7px;padding:8px;min-width:0}.finder-items button[aria-pressed=true]{background:#589cff40}.finder-items button span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.finder-items img,.mark{width:40px;height:40px;object-fit:contain;border-radius:8px}.mark{display:grid;place-items:center;color:white}.finder-items.list{display:flex;flex-direction:column}.finder-items.list button{flex-direction:row;gap:12px}.finder-type{margin-left:auto;opacity:.65;font-size:12px}.finder-items.list button:nth-child(2n){background:#8881}.finder-items.list button[aria-pressed=true]{background:#589cff40}.finder footer{border-top:1px solid #8883;border-bottom:0;font-size:12px}.finder footer>span{margin-right:auto}.finder-restore{position:fixed;z-index:16;bottom:85px;left:24px;padding:9px 16px;border-radius:10px;background:#333c;color:white;border:1px solid #fff4}
@media(max-width:600px){.finder aside{width:110px}.finder{top:8vh;height:82vh}.finder nav label{margin-left:0}}
@media(prefers-reduced-motion:no-preference){.finder{animation:finder-in .16s ease-out}@keyframes finder-in{from{opacity:0}to{opacity:1}}}
</style>
