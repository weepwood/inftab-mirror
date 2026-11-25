<script setup lang="ts">
import SelectField from "../components/SelectField.vue"
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Folder, Layers } from '@lucide/vue'
import FinderWindow from './FinderWindow.vue'
import { launcherIcons } from '../components/launcherIcons'
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
import { activeWindow, activateWindow, closeWindow, openWindow, updateWindow, maxWindows, reconcileWindowSpaces, type DesktopWindow } from './windowManager'

const props = defineProps<{ request?: { sequence:number; workspaceId:string; folderId?:string; panelId?:PanelId; targetId?:string;fromDock?:true }; context:PanelPluginContext; overviewRequest?:number; operationError?:string; history:{undo:boolean;redo:boolean}; mutate:(action:DesktopMutation)=>Promise<boolean>; items:LauncherItem[]; workspaces:HomeWorkspace[]; workspaceId:string; dark?:boolean; blocked?:boolean }>()
const emit = defineEmits<{ open:[item:LauncherItem,event?:MouseEvent]; edit:[item:LauncherItem]; remove:[item:LauncherItem]; create:[workspaceId:string,parentId?:string]; dismissError:[]; switchWorkspace:[id:string]; running:[ids:PanelId[],finder:boolean] }>()
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
// Closed windows leave the logical/session state immediately. Retain only
// their inert view until the existing Vue leave transition finishes.
const closing=ref<DesktopWindow[]>([])
const renderedWindows=computed(()=>[...state.value.windows,...closing.value])
const overviewCurrentOnly=ref(false)
const overviewWindows=computed(()=>state.value.windows.slice().reverse().filter(w=>!overviewCurrentOnly.value||w.spaceId===props.workspaceId))
function frameProps(w:DesktopWindow,index:number){
 return {dark:props.dark,active:w.id===active.value,hidden:w.spaceId!==props.workspaceId||closing.value.some(c=>c.id===w.id),minimized:w.minimized,maximized:w.maximized,cascade:w.cascade,layer:index+1}
}

function finishClose(id:number){if(closing.value.some(w=>w.id===id))closing.value=closing.value.filter(w=>w.id!==id)}
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
watch(()=>state.value.windows,windows=>emit('running',windows.flatMap(w=>w.panelId?[w.panelId]:[]),windows.some(w=>!w.panelId)),{immediate:true})
const overviewRoot=ref<HTMLElement>()
let overviewTrigger:HTMLElement|undefined
function openOverview(){
 if(props.blocked)return
 overviewTrigger=document.activeElement instanceof HTMLElement?document.activeElement:undefined
 overviewCurrentOnly.value=false
 overview.value=true
 void nextTick(()=>overviewRoot.value?.querySelector<HTMLButtonElement>('header button')?.focus({preventScroll:true}))
}
function closeOverview(restore=false){
 if(!overview.value)return
 overview.value=false
 const trigger=overviewTrigger;overviewTrigger=undefined
 if(restore)void nextTick(()=>{if(trigger?.isConnected&&!trigger.closest('[inert]'))trigger.focus({preventScroll:true})})
}
function overviewOutside(event:PointerEvent){
 if(overview.value&&!overviewRoot.value?.contains(event.target as Node)&&!(event.target as Element)?.closest('[aria-label="窗口概览"],.desktop-menu-label'))closeOverview()
}
watch(()=>props.overviewRequest,value=>{if(value){if(overview.value)closeOverview(true);else openOverview()}},{immediate:true})
watch(()=>props.blocked,value=>{if(value)closeOverview()})
watch(()=>props.workspaceId,()=>closeOverview())
onMounted(()=>document.addEventListener('pointerdown',overviewOutside,true))
onBeforeUnmount(()=>document.removeEventListener('pointerdown',overviewOutside,true))
watch(()=>props.request, request=>{
 if(!request)return
 if(request.fromDock){const recent=state.value.windows.slice().reverse().find(w=>!w.panelId&&w.spaceId===request.workspaceId);if(recent){limit.value=false;activate(recent.id);return}}
 const next=openWindow(state.value,request)
 limit.value=next===state.value&&state.value.windows.length>=maxWindows&&!state.value.windows.some(w=>request.panelId?w.panelId===request.panelId:!w.panelId&&w.workspaceId===request.workspaceId&&w.folderId===request.folderId)
 closeOverview()
 state.value=next
 const opened=next.windows.at(-1)
 if(!limit.value&&opened&&opened.spaceId!==props.workspaceId)emit('switchWorkspace',opened.spaceId)
},{immediate:true})
function activate(id:number){
 const target=state.value.windows.find(w=>w.id===id)
 if(target&&target.spaceId!==props.workspaceId)emit('switchWorkspace',target.spaceId)
 state.value=activateWindow(state.value,id);closeOverview()
}
function close(id:number){
 const w=state.value.windows.find(w=>w.id===id)
 if(!w)return
 if(!w.minimized&&w.spaceId===props.workspaceId&&!matchMedia('(prefers-reduced-motion: reduce)').matches)closing.value=[...closing.value.slice(-maxWindows+1),w]
 state.value=closeWindow(state.value,id);limit.value=false
 if(!state.value.windows.length)closeOverview()
}
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
  <template v-for="(window,index) in renderedWindows" :key="window.id">
  <ToolWindow v-if="window.panelId" :panel-id="window.panelId" :target-id="window.targetId" :target-sequence="window.sequence" :context="context" v-bind="frameProps(window,index)" @activate="activate(window.id)" @close="close(window.id)" @left="finishClose(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" />
  <FinderWindow v-else :history="history" @history-action="historyAction" :clipboard="clipboard" :pasting="pasting" @clipboard="clipboard=$event" @paste="paste" :items="items" :workspaces="workspaces" :workspace-id="window.workspaceId" :folder-id="window.folderId" :browse-workspace-id="window.browseWorkspaceId" :browse-folder-id="window.browseFolderId" @location="(workspaceId:string,folderId?:string)=>browse(window.id,workspaceId,folderId)" v-bind="frameProps(window,index)" @activate="activate(window.id)" @close="close(window.id)" @left="finishClose(window.id)" @minimize="minimize(window.id)" @maximize="maximize(window.id)" @title="title(window.id,$event)" @open="forwardOpen" @edit="emit('edit',$event)" @remove="emit('remove',$event)" @move="forwardMove" @membership="forwardMembership" @reparent="reparent" @create="createFolder" />
  </template>
  <div v-if="state.windows.length" class="window-shelf">
   <button type="button" aria-label="窗口概览" :aria-expanded="overview" @click="overview?closeOverview(true):openOverview()"><Layers :size="16"/> {{state.windows.length}} 个窗口</button>
   <button v-for="window in minimized" :key="window.id" type="button" :aria-label="window.panelId?'恢复 '+window.title:'恢复 Finder'" :title="window.title" @click="activate(window.id)"><component :is="window.panelId?launcherIcons[window.panelId]??Folder:Folder" :size="16"/> {{window.title}}</button>
  </div>
  <section v-if="overview" ref="overviewRoot" class="window-overview" aria-label="窗口概览" @keydown.esc.stop.prevent="closeOverview(true)">
   <header><strong>运行中的窗口</strong><button type="button" @click="closeOverview(true)">关闭概览</button></header>
   <div class="space-list"><small>桌面空间</small><button v-for="space in workspaces" :key="space.id" :aria-pressed="space.id===workspaceId" @click="emit('switchWorkspace',space.id);closeOverview(true)"><span class="space-preview" aria-hidden="true"><i v-for="item in previewItems(space)" :key="item.id" :style="{left:item.x+'%',top:item.y+'%'}"/></span><strong>{{space.name}}</strong><span>{{state.windows.filter(w=>w.spaceId===space.id).length}} 个窗口</span></button></div>
   <div class="overview-filter"><span>{{overviewWindows.length}} 个窗口</span><button type="button" :aria-pressed="overviewCurrentOnly" @click="overviewCurrentOnly=!overviewCurrentOnly">仅当前空间</button></div>
   <p v-if="!overviewWindows.length">{{overviewCurrentOnly?'当前空间没有运行中的窗口。':'没有运行中的窗口。'}}</p>
   <div v-if="overviewWindows.length" class="overview-grid"><div v-for="window in overviewWindows" :key="window.id" class="overview-window"><button type="button" class="overview-card" @click="activate(window.id)"><span class="overview-preview" :class="{'is-minimized':window.minimized,'is-active':window.id===active}" aria-hidden="true"><span class="overview-titlebar"><i/><i/><i/></span><span class="overview-preview-body"><component :is="window.panelId?launcherIcons[window.panelId]??Folder:Folder" :size="32" :stroke-width="1.5"/></span></span><span class="overview-caption">{{window.title}}<small>{{spaceName(window.spaceId)}} · {{window.minimized?'已最小化':window.id===active?'当前窗口':'打开中'}}</small></span></button><SelectField :aria-label="'移动窗口 '+window.title" :model-value="window.spaceId" @change="moveWindow(window.id,$event)"><option v-for="space in workspaces" :key="space.id" :value="space.id">{{space.name}}</option></SelectField></div></div>
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
.window-shelf,.window-overview,.window-limit{position:absolute;z-index:20;pointer-events:auto;color:var(--mac-ink);background:var(--mac-menu);border:1px solid var(--mac-line);border-radius:var(--mac-radius-popover);box-shadow:var(--mac-shadow);backdrop-filter:blur(20px) saturate(140%)}
.window-shelf{left:12px;bottom:84px;display:flex;gap:4px;padding:4px;max-width:calc(100vw - 24px);overflow:auto}
.window-shelf button,.window-overview button{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:8px;border-radius:7px;cursor:pointer;white-space:nowrap}
.window-shelf button:hover,.window-overview button:hover,.window-shelf button:focus-visible,.window-overview button:focus-visible{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.window-overview{left:50%;top:56px;bottom:auto;transform:translateX(-50%);width:min(680px,calc(100vw - 24px));padding:14px;max-height:calc(100dvh - 144px);overflow:auto}.window-overview header{display:flex;align-items:center;justify-content:space-between;padding:4px 6px}.window-overview>button{width:100%;text-align:left}.window-overview>button span{flex:1;overflow:hidden;text-overflow:ellipsis}.window-overview small{opacity:.7}
.space-list{display:flex;gap:5px;flex-wrap:wrap;border-block:1px solid var(--ui-border);padding:8px 0;margin:5px 0}.space-list small{flex-basis:100%;padding:2px 6px;opacity:.7}.space-list button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.space-list button{display:flex;flex-direction:column;align-items:stretch;width:calc(33.333% - 4px);min-width:105px;white-space:normal;text-align:left;border:1px solid var(--mac-line)}.space-list button>span:last-child{font-size:10px;opacity:.7}.space-preview{min-height:78px;position:relative;overflow:hidden;background:linear-gradient(135deg,#7894a5,#415e71);border-radius:6px;padding:7px}.space-preview i{position:absolute;width:6%;height:9%;background:#ffffffa0;border-radius:2px}.overview-window>button>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.overview-window small{display:block;font-size:10px}
.recovery-panel{width:min(400px,calc(100vw - 24px));box-sizing:border-box;font-size:13px}.recovery-panel p{margin:6px 0;line-height:1.5}.recovery-panel>div{display:flex;gap:6px;flex-wrap:wrap}.recovery-panel button{border:1px solid var(--ui-border);background:var(--ui-panel);color:inherit;padding:6px 8px;border-radius:6px;cursor:pointer}.recovery-panel button:disabled{opacity:.4;cursor:default}
.window-limit{left:12px;bottom:130px;padding:10px;max-width:calc(100vw - 24px)}

.overview-filter{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;color:var(--mac-muted);font-size:12px}
.overview-filter button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.overview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px;padding:4px 0}
.overview-window{min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:5px;border:0;padding:5px;background:var(--mac-window);border-radius:8px}
.overview-window .overview-card{display:flex;flex-direction:column;align-items:stretch;padding:3px;text-align:left;gap:7px;white-space:normal}
.overview-preview{height:92px;border:1px solid var(--mac-line);border-radius:7px;overflow:hidden;display:flex;flex-direction:column;background:var(--mac-sidebar)}
.overview-preview.is-active{border-color:var(--mac-selection);box-shadow:0 0 0 1px var(--mac-selection)}
.overview-preview.is-minimized{opacity:.65}
.overview-titlebar{height:18px;display:flex;align-items:center;gap:4px;padding:0 7px;background:var(--mac-toolbar);border-bottom:1px solid var(--mac-line)}
.overview-titlebar i{width:6px;height:6px;border-radius:50%;background:#ff5f57}.overview-titlebar i:nth-child(2){background:#febc2e}.overview-titlebar i:nth-child(3){background:#28c840}
.overview-preview-body{flex:1;display:grid;place-items:center;color:var(--mac-muted)}
.overview-caption{font-weight:600;line-height:1.4}.overview-caption small{font-weight:400;margin-top:3px}
.overview-window .select-field{width:100%;--select-height:30px;font-size:12px}
@media(max-width:460px){.desktop-windows:has(.window-frame.active:not([aria-hidden=true])) .window-shelf{visibility:hidden}.overview-grid{grid-template-columns:repeat(auto-fill,minmax(125px,1fr))}.overview-preview{height:72px}}
</style>
