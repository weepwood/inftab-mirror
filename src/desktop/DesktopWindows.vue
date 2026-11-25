<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Folder, Layers } from '@lucide/vue'
import FinderWindow from './FinderWindow.vue'
import type { LauncherItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { activeWindow, activateWindow, closeWindow, emptyWindows, openWindow, updateWindow, maxWindows } from './windowManager'

const props = defineProps<{ request?: { sequence:number; workspaceId:string; folderId?:string }; items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; dark?:boolean }>()
const emit = defineEmits<{ open:[item:LauncherItem,event?:MouseEvent]; edit:[item:LauncherItem]; remove:[item:LauncherItem]; move:[item:LauncherItem,id:string]; membership:[item:LauncherItem,folderId:string|null]; create:[workspaceId:string] }>()
const state=ref(emptyWindows()), overview=ref(false), limit=ref(false)
const active=computed(()=>activeWindow(state.value))
const minimized=computed(()=>state.value.windows.filter(w=>w.minimized))
watch(()=>props.request, request=>{
 if(!request)return
 const next=openWindow(state.value,request)
 limit.value=next===state.value&&state.value.windows.length>=maxWindows&&!state.value.windows.some(w=>w.workspaceId===request.workspaceId&&w.folderId===request.folderId)
 state.value=next
},{immediate:true})
function activate(id:number){state.value=activateWindow(state.value,id);overview.value=false}
function close(id:number){state.value=closeWindow(state.value,id);limit.value=false;if(!state.value.windows.length)overview.value=false}
function minimize(id:number){state.value=updateWindow(state.value,id,{minimized:true})}
function maximize(id:number){const w=state.value.windows.find(w=>w.id===id);if(w)state.value=updateWindow(state.value,id,{maximized:!w.maximized})}
function title(id:number,value:string){state.value=updateWindow(state.value,id,{title:value})}
function forwardOpen(item:LauncherItem,event?:MouseEvent){emit('open',item,event)}
function forwardMove(item:LauncherItem,id:string){emit('move',item,id)}
function forwardMembership(item:LauncherItem,id:string|null){emit('membership',item,id)}
</script>
<template>
 <div class="desktop-windows" :class="{dark}">
  <FinderWindow v-for="(window,index) in state.windows" :key="window.id" :items="items" :workspaces="workspaces" :workspace-id="window.workspaceId" :folder-id="window.folderId" :dark="dark" :active="window.id===active" :minimized="window.minimized" :maximized="window.maximized" :cascade="window.cascade" :layer="index+1" @activate="activate(window.id)" @close="close(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" @open="forwardOpen" @edit="emit('edit',$event)" @remove="emit('remove',$event)" @move="forwardMove" @membership="forwardMembership" @create="emit('create',$event)" />
  <div v-if="state.windows.length" class="window-shelf">
   <button type="button" aria-label="窗口概览" :aria-expanded="overview" @click="overview=!overview"><Layers :size="16"/> {{state.windows.length}} 个窗口</button>
   <button v-for="window in minimized" :key="window.id" type="button" aria-label="恢复 Finder" :title="window.title" @click="activate(window.id)"><Folder :size="16"/> {{window.title}}</button>
  </div>
  <section v-if="overview" class="window-overview" aria-label="窗口概览" @keydown.esc.stop="overview=false">
   <header><strong>运行中的窗口</strong><button type="button" @click="overview=false">关闭概览</button></header>
   <button v-for="window in [...state.windows].reverse()" :key="window.id" type="button" @click="activate(window.id)"><Folder :size="20"/><span>{{window.title}}</span><small>{{window.minimized?'已最小化':window.id===active?'当前窗口':'打开中'}}</small></button>
  </section>
  <p v-if="limit" role="status" class="window-limit">最多打开 {{maxWindows}} 个 Finder 窗口，请先关闭一个。</p>
 </div>
</template>
<style scoped>
.desktop-windows{position:fixed;inset:0;pointer-events:none;z-index:9}
.window-shelf,.window-overview,.window-limit{position:absolute;z-index:20;pointer-events:auto;color:var(--ui-text);background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:12px;box-shadow:var(--ui-menu-shadow)}
.window-shelf{left:12px;bottom:84px;display:flex;gap:4px;padding:4px;max-width:calc(100vw - 24px);overflow:auto}
.window-shelf button,.window-overview button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:8px;border-radius:7px;cursor:pointer;white-space:nowrap}
.window-shelf button:hover,.window-overview button:hover,.window-shelf button:focus-visible,.window-overview button:focus-visible{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.window-overview{left:12px;bottom:130px;width:min(330px,calc(100vw - 24px));padding:10px;max-height:55vh;overflow:auto}.window-overview header{display:flex;align-items:center;justify-content:space-between;padding:4px 6px}.window-overview>button{width:100%;text-align:left}.window-overview>button span{flex:1;overflow:hidden;text-overflow:ellipsis}.window-overview small{opacity:.7}
.window-limit{left:12px;bottom:130px;padding:10px;max-width:calc(100vw - 24px)}
</style>
