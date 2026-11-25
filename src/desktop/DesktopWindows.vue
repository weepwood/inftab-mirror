<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Folder, Layers } from '@lucide/vue'
import FinderWindow from './FinderWindow.vue'
import { defineAsyncComponent } from 'vue'
import type { DesktopMutation, FinderClipboard } from './ownership'
import type { PanelId } from '../plugins/ids'
import type { PanelPluginContext } from '../plugins/registry'
const ToolWindow=defineAsyncComponent(()=>import('./ToolWindow.vue'))
import type { LauncherItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { readIntent,readTransactionValues,canReplay,type TransactionIntent } from './transactionIntent'
import { folderParents } from '../data/folderTree'
import { readWindowSession, saveWindowSession } from './windowSession'
import { activeWindow, activateWindow, closeWindow, openWindow, updateWindow, maxWindows, reconcileWindowSpaces } from './windowManager'

const props = defineProps<{ request?: { sequence:number; workspaceId:string; folderId?:string; panelId?:PanelId; targetId?:string }; context:PanelPluginContext; overviewRequest?:number; operationError?:string; history:{undo:boolean;redo:boolean}; mutate:(action:DesktopMutation)=>Promise<boolean>; items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; dark?:boolean }>()
const emit = defineEmits<{ open:[item:LauncherItem,event?:MouseEvent]; edit:[item:LauncherItem]; remove:[item:LauncherItem]; create:[workspaceId:string,parentId?:string]; dismissError:[]; switchWorkspace:[id:string]; running:[ids:PanelId[]] }>()
const state=ref(readWindowSession(props.workspaces,props.items.filter(i=>i.folder).map(i=>i.id))), overview=ref(false), limit=ref(false)
watch(state,value=>saveWindowSession(value))
const clipboard=ref<FinderClipboard>(),pasting=ref(false)
const pending=ref<TransactionIntent>(),replayable=ref(false),recovering=ref(false)
async function refreshIntent(){
 try{pending.value=await readIntent();replayable.value=!!pending.value&&canReplay(pending.value,readTransactionValues())}catch{/* mutation reports storage errors */}
}
onMounted(refreshIntent)
watch(()=>props.operationError,()=>void refreshIntent())
async function recover(direction:'rollback'|'complete'|'keep'){
 if(!pending.value||recovering.value)return
 const question=direction==='keep'?'结束事务记录并保留已写入的数据？这会刷新页面并丢弃四类入口数据尚未写入的修改。请先导出备份，并关闭其他编辑中的标签页。':'恢复将刷新页面，丢弃尚未写入的入口、文件夹、排序和工作区修改。请关闭其他编辑中的标签页。是否继续？'
 if(!window.confirm(question))return
 recovering.value=true
 try{await props.mutate({kind:'recover',id:pending.value.id,direction});await refreshIntent()}
 finally{recovering.value=false}
}
const active=computed(()=>activeWindow(state.value,props.workspaceId))
const minimized=computed(()=>state.value.windows.filter(w=>w.minimized&&w.spaceId===props.workspaceId))
function previewItems(space:HomeWorkspace){
 const members=new Set(props.items.filter(i=>i.folder&&space.itemIds.includes(i.id)).flatMap(i=>i.folder!.shortcutIds))
 const parents=folderParents(props.items.flatMap(i=>i.folder?[i.folder]:[]),space)
 return space.itemIds.filter(id=>!members.has(id)&&!parents.has(id)).slice(0,30).map((id,index)=>{
  const point=space.desktop?.positions[id]
  return {id,x:point?Math.min(94,Math.max(0,point.x/1440*100)):5+index%6*15,y:point?Math.min(85,Math.max(0,point.y/900*100)):8+Math.floor(index/6)*16}
 })
}
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
function browse(id:number,workspaceId:string,folderId?:string){state.value=updateWindow(state.value,id,{browseWorkspaceId:workspaceId,browseFolderId:folderId})}
function title(id:number,value:string){state.value=updateWindow(state.value,id,{title:value})}
function historyAction(kind:'undo'|'redo'){void props.mutate({kind})}
function forwardOpen(item:LauncherItem,event?:MouseEvent){emit('open',item,event)}
function reparent(ids:string[],workspaceId:string,folderId:string|null){void props.mutate({kind:'reparent',ids,workspaceId,folderId})}
function createFolder(id:string,parentId?:string){emit('create',id,parentId)}
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
  <ToolWindow v-if="window.panelId" :panel-id="window.panelId" :target-id="window.targetId" :target-sequence="window.sequence" :context="context" :dark="dark" :active="window.id===active" :hidden="window.spaceId!==workspaceId" :minimized="window.minimized" :maximized="window.maximized" :cascade="window.cascade" :layer="index+1" @activate="activate(window.id)" @close="close(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" />
  <FinderWindow v-else :history="history" @history-action="historyAction" :clipboard="clipboard" :pasting="pasting" @clipboard="clipboard=$event" @paste="paste" :items="items" :workspaces="workspaces" :workspace-id="window.workspaceId" :folder-id="window.folderId" :browse-workspace-id="window.browseWorkspaceId" :browse-folder-id="window.browseFolderId" @location="(workspaceId:string,folderId?:string)=>browse(window.id,workspaceId,folderId)" :dark="dark" :active="window.id===active" :hidden="window.spaceId!==workspaceId" :minimized="window.minimized" :maximized="window.maximized" :cascade="window.cascade" :layer="index+1" @activate="activate(window.id)" @close="close(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" @open="forwardOpen" @edit="emit('edit',$event)" @remove="emit('remove',$event)" @move="forwardMove" @membership="forwardMembership" @reparent="reparent" @create="createFolder" />
  </template>
  <div v-if="state.windows.length" class="window-shelf">
   <button type="button" aria-label="窗口概览" :aria-expanded="overview" @click="overview=!overview"><Layers :size="16"/> {{state.windows.length}} 个窗口</button>
   <button v-for="window in minimized" :key="window.id" type="button" :aria-label="window.panelId?'恢复 '+window.title:'恢复 Finder'" :title="window.title" @click="activate(window.id)"><Folder :size="16"/> {{window.title}}</button>
  </div>
  <section v-if="overview" class="window-overview" aria-label="窗口概览" @keydown.esc.stop="overview=false">
   <header><strong>运行中的窗口</strong><button type="button" @click="overview=false">关闭概览</button></header>
   <div class="space-list"><small>桌面空间</small><button v-for="space in workspaces" :key="space.id" :aria-pressed="space.id===workspaceId" @click="emit('switchWorkspace',space.id);overview=false"><span class="space-preview" aria-hidden="true"><i v-for="item in previewItems(space)" :key="item.id" :style="{left:item.x+'%',top:item.y+'%'}"/></span><strong>{{space.name}}</strong><span>{{state.windows.filter(w=>w.spaceId===space.id).length}} 个窗口</span></button></div>
   <p v-if="!state.windows.length">没有运行中的窗口。</p>
   <div v-for="window in [...state.windows].reverse()" :key="window.id" class="overview-window"><button type="button" @click="activate(window.id)"><Folder :size="20"/><span>{{window.title}}<small>{{spaceName(window.spaceId)}} · {{window.minimized?'已最小化':window.id===active?'当前窗口':'打开中'}}</small></span></button><select :aria-label="'移动窗口 '+window.title" :value="window.spaceId" @change="moveWindow(window.id,$event)"><option v-for="space in workspaces" :key="space.id" :value="space.id">{{space.name}}</option></select></div>
  </section>
  <section v-if="pending" class="window-limit recovery-panel" aria-label="桌面事务恢复">
   <strong>发现未完成的桌面事务</strong><p>{{replayable?'可以继续写入或回退到操作前。':'检测到其他修改，禁止自动回放，请先导出备份。'}}</p>
   <div><button :disabled="recovering||!replayable" @click="recover('complete')">完成写入</button><button :disabled="recovering||!replayable" @click="recover('rollback')">回退事务</button><button :disabled="recovering" @click="recover('keep')">保留当前数据</button></div>
   <p v-if="operationError" role="alert">{{operationError}}</p>
  </section>
  <div v-else-if="operationError" class="window-limit" role="alert">{{operationError}} <button type="button" @click="emit('dismissError')">关闭</button></div>
  <p v-else-if="limit" role="status" class="window-limit">最多打开 {{maxWindows}} 个窗口，请先关闭一个。</p>
 </div>
</template>
<style scoped>
.desktop-windows{position:fixed;inset:0;pointer-events:none;z-index:9}
.window-shelf,.window-overview,.window-limit{position:absolute;z-index:20;pointer-events:auto;color:var(--mac-ink);background:var(--mac-menu);border:1px solid var(--mac-line);border-radius:10px;box-shadow:var(--mac-shadow);backdrop-filter:blur(20px) saturate(140%)}
.window-shelf{left:12px;bottom:84px;display:flex;gap:4px;padding:4px;max-width:calc(100vw - 24px);overflow:auto}
.window-shelf button,.window-overview button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:8px;border-radius:7px;cursor:pointer;white-space:nowrap}
.window-shelf button:hover,.window-overview button:hover,.window-shelf button:focus-visible,.window-overview button:focus-visible{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.window-overview{left:50%;top:56px;bottom:auto;transform:translateX(-50%);width:min(680px,calc(100vw - 24px));padding:14px;max-height:calc(100dvh - 144px);overflow:auto}.window-overview header{display:flex;align-items:center;justify-content:space-between;padding:4px 6px}.window-overview>button{width:100%;text-align:left}.window-overview>button span{flex:1;overflow:hidden;text-overflow:ellipsis}.window-overview small{opacity:.7}
.space-list{display:flex;gap:5px;flex-wrap:wrap;border-block:1px solid var(--ui-border);padding:8px 0;margin:5px 0}.space-list small{flex-basis:100%;padding:2px 6px;opacity:.7}.space-list button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.space-list button{display:flex;flex-direction:column;align-items:stretch;width:calc(33.333% - 4px);min-width:105px;white-space:normal;text-align:left;border:1px solid var(--mac-line)}.space-list button>span:last-child{font-size:10px;opacity:.7}.space-preview{min-height:78px;position:relative;overflow:hidden;background:linear-gradient(135deg,#7894a5,#415e71);border-radius:6px;padding:7px}.space-preview i{position:absolute;width:6%;height:9%;background:#ffffffa0;border-radius:2px}.overview-window{display:flex;align-items:center;gap:8px;padding:3px;border-bottom:1px solid var(--mac-line)}.overview-window>button{flex:1;min-width:0;text-align:left}.overview-window>button>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.overview-window small{display:block;font-size:10px}.overview-window select{max-width:100px;border:1px solid var(--ui-border);background:var(--ui-surface);color:inherit;border-radius:6px;padding:5px}
.recovery-panel{width:min(400px,calc(100vw - 24px));box-sizing:border-box;font-size:13px}.recovery-panel p{margin:6px 0;line-height:1.5}.recovery-panel>div{display:flex;gap:6px;flex-wrap:wrap}.recovery-panel button{border:1px solid var(--ui-border);background:var(--ui-panel);color:inherit;padding:6px 8px;border-radius:6px;cursor:pointer}.recovery-panel button:disabled{opacity:.4;cursor:default}
.window-limit{left:12px;bottom:130px;padding:10px;max-width:calc(100vw - 24px)}
</style>
