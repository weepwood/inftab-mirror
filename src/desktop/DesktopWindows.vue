<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Folder, Layers } from '@lucide/vue'
import FinderWindow from './FinderWindow.vue'
import { defineAsyncComponent } from 'vue'
import type { DesktopMutation, FinderClipboard } from './ownership'
import type { PanelId } from '../plugins/ids'
import type { PanelPluginContext } from '../plugins/registry'
const ToolWindow=defineAsyncComponent(()=>import('./ToolWindow.vue'))
import type { LauncherItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { activeWindow, activateWindow, closeWindow, emptyWindows, openWindow, updateWindow, maxWindows, reconcileWindowSpaces } from './windowManager'

const props = defineProps<{ request?: { sequence:number; workspaceId:string; folderId?:string; panelId?:PanelId }; context:PanelPluginContext; overviewRequest?:number; operationError?:string; mutate:(action:DesktopMutation)=>Promise<boolean>; items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; dark?:boolean }>()
const emit = defineEmits<{ open:[item:LauncherItem,event?:MouseEvent]; edit:[item:LauncherItem]; remove:[item:LauncherItem]; create:[workspaceId:string]; dismissError:[]; switchWorkspace:[id:string]; running:[ids:PanelId[]] }>()
const state=ref(emptyWindows()), overview=ref(false), limit=ref(false)
const clipboard=ref<FinderClipboard>(),pasting=ref(false)
const active=computed(()=>activeWindow(state.value,props.workspaceId))
const minimized=computed(()=>state.value.windows.filter(w=>w.minimized&&w.spaceId===props.workspaceId))
const spaceName=(id:string)=>props.workspaces.find(w=>w.id===id)?.name??'主页'
watch(()=>props.workspaces.map(w=>w.id),ids=>{state.value=reconcileWindowSpaces(state.value,ids,ids[0]??props.workspaceId)})
function moveWindow(id:number,event:Event){
 const target=(event.target as HTMLSelectElement).value
 if(props.workspaces.some(w=>w.id===target))state.value=updateWindow(state.value,id,{spaceId:target})
}
watch(()=>state.value.windows.map(w=>w.panelId).filter((id):id is PanelId=>!!id),ids=>emit('running',ids),{immediate:true})
watch(()=>props.overviewRequest,value=>{if(value)overview.value=true},{immediate:true})
watch(()=>props.request, request=>{
 if(!request)return
 const next=openWindow(state.value,request)
 limit.value=next===state.value&&state.value.windows.length>=maxWindows&&!state.value.windows.some(w=>request.panelId?w.panelId===request.panelId:!w.panelId&&w.workspaceId===request.workspaceId&&w.folderId===request.folderId)
 state.value=next
 const opened=next.windows.at(-1)
 if(!limit.value&&opened&&opened.spaceId!==props.workspaceId)emit('switchWorkspace',opened.spaceId)
},{immediate:true})
function activate(id:number){
 const target=state.value.windows.find(w=>w.id===id)
 if(target&&target.spaceId!==props.workspaceId)emit('switchWorkspace',target.spaceId)
 state.value=activateWindow(state.value,id);overview.value=false
}
function close(id:number){state.value=closeWindow(state.value,id);limit.value=false;if(!state.value.windows.length)overview.value=false}
function minimize(id:number){state.value=updateWindow(state.value,id,{minimized:true})}
function maximize(id:number){const w=state.value.windows.find(w=>w.id===id);if(w)state.value=updateWindow(state.value,id,{maximized:!w.maximized})}
function title(id:number,value:string){state.value=updateWindow(state.value,id,{title:value})}
function forwardOpen(item:LauncherItem,event?:MouseEvent){emit('open',item,event)}
function forwardMove(ids:string[],id:string){void props.mutate({kind:'move',ids,workspaceId:id})}
function forwardMembership(ids:string[],id:string|null){void props.mutate({kind:'membership',ids,folderId:id})}
async function paste(workspaceId:string,folderId:string|null){
 if(!clipboard.value||pasting.value)return
 const value=clipboard.value
 pasting.value=true
 try{if(await props.mutate({kind:'paste',clipboard:value,workspaceId,folderId})&&value.mode==='cut'&&clipboard.value===value)clipboard.value=undefined}
 finally{pasting.value=false}
}
</script>
<template>
 <div class="desktop-windows" :class="{dark}">
  <template v-for="(window,index) in state.windows" :key="window.id">
  <ToolWindow v-if="window.panelId" :panel-id="window.panelId" :context="context" :dark="dark" :active="window.id===active" :hidden="window.spaceId!==workspaceId" :minimized="window.minimized" :maximized="window.maximized" :cascade="window.cascade" :layer="index+1" @activate="activate(window.id)" @close="close(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" />
  <FinderWindow v-else :clipboard="clipboard" :pasting="pasting" @clipboard="clipboard=$event" @paste="paste" :items="items" :workspaces="workspaces" :workspace-id="window.workspaceId" :folder-id="window.folderId" :dark="dark" :active="window.id===active" :hidden="window.spaceId!==workspaceId" :minimized="window.minimized" :maximized="window.maximized" :cascade="window.cascade" :layer="index+1" @activate="activate(window.id)" @close="close(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" @open="forwardOpen" @edit="emit('edit',$event)" @remove="emit('remove',$event)" @move="forwardMove" @membership="forwardMembership" @create="emit('create',$event)" />
  </template>
  <div v-if="state.windows.length" class="window-shelf">
   <button type="button" aria-label="窗口概览" :aria-expanded="overview" @click="overview=!overview"><Layers :size="16"/> {{state.windows.length}} 个窗口</button>
   <button v-for="window in minimized" :key="window.id" type="button" :aria-label="window.panelId?'恢复 '+window.title:'恢复 Finder'" :title="window.title" @click="activate(window.id)"><Folder :size="16"/> {{window.title}}</button>
  </div>
  <section v-if="overview" class="window-overview" aria-label="窗口概览" @keydown.esc.stop="overview=false">
   <header><strong>运行中的窗口</strong><button type="button" @click="overview=false">关闭概览</button></header>
   <div class="space-list"><small>桌面空间</small><button v-for="space in workspaces" :key="space.id" :aria-pressed="space.id===workspaceId" @click="emit('switchWorkspace',space.id);overview=false"><span class="space-preview" aria-hidden="true"><i v-for="n in Math.min(space.itemIds.length,12)" :key="n"/></span><strong>{{space.name}}</strong><span>{{state.windows.filter(w=>w.spaceId===space.id).length}} 个窗口</span></button></div>
   <p v-if="!state.windows.length">没有运行中的窗口。</p>
   <div v-for="window in [...state.windows].reverse()" :key="window.id" class="overview-window"><button type="button" @click="activate(window.id)"><Folder :size="20"/><span>{{window.title}}<small>{{spaceName(window.spaceId)}} · {{window.minimized?'已最小化':window.id===active?'当前窗口':'打开中'}}</small></span></button><select :aria-label="'移动窗口 '+window.title" :value="window.spaceId" @change="moveWindow(window.id,$event)"><option v-for="space in workspaces" :key="space.id" :value="space.id">{{space.name}}</option></select></div>
  </section>
  <div v-if="operationError" class="window-limit" role="alert">{{operationError}} <button type="button" @click="emit('dismissError')">关闭</button></div>
  <p v-else-if="limit" role="status" class="window-limit">最多打开 {{maxWindows}} 个窗口，请先关闭一个。</p>
 </div>
</template>
<style scoped>
.desktop-windows{position:fixed;inset:0;pointer-events:none;z-index:9}
.window-shelf,.window-overview,.window-limit{position:absolute;z-index:20;pointer-events:auto;color:var(--ui-text);background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:12px;box-shadow:var(--ui-menu-shadow)}
.window-shelf{left:12px;bottom:84px;display:flex;gap:4px;padding:4px;max-width:calc(100vw - 24px);overflow:auto}
.window-shelf button,.window-overview button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:8px;border-radius:7px;cursor:pointer;white-space:nowrap}
.window-shelf button:hover,.window-overview button:hover,.window-shelf button:focus-visible,.window-overview button:focus-visible{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.window-overview{left:12px;bottom:130px;width:min(390px,calc(100vw - 24px));padding:10px;max-height:55vh;overflow:auto}.window-overview header{display:flex;align-items:center;justify-content:space-between;padding:4px 6px}.window-overview>button{width:100%;text-align:left}.window-overview>button span{flex:1;overflow:hidden;text-overflow:ellipsis}.window-overview small{opacity:.7}
.space-list{display:flex;gap:5px;flex-wrap:wrap;border-block:1px solid var(--ui-border);padding:8px 0;margin:5px 0}.space-list small{flex-basis:100%;padding:2px 6px;opacity:.7}.space-list button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.space-list button{display:flex;flex-direction:column;align-items:stretch;width:calc(50% - 3px);white-space:normal;text-align:left;border:1px solid var(--ui-border)}.space-list button>span:last-child{font-size:10px;opacity:.7}.space-preview{min-height:48px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;align-content:start;background:linear-gradient(135deg,#7894a5,#415e71);border-radius:6px;padding:7px}.space-preview i{height:7px;background:#ffffffa0;border-radius:2px}.overview-window{display:flex;align-items:center;gap:4px}.overview-window>button{flex:1;min-width:0;text-align:left}.overview-window>button>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.overview-window small{display:block;font-size:10px}.overview-window select{max-width:100px;border:1px solid var(--ui-border);background:var(--ui-surface);color:inherit;border-radius:6px;padding:5px}
.window-limit{left:12px;bottom:130px;padding:10px;max-width:calc(100vw - 24px)}
</style>
