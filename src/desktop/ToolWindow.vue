<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/actions/resize'
import '@interactjs/auto-start'
import type { PanelId } from '../plugins/ids'
import type { PanelPluginContext } from '../plugins/registry'
import { panelPlugins, getPanelProps, getPanelListeners } from '../plugins/registry'

const props=defineProps<{panelId:PanelId; context:PanelPluginContext; active:boolean; minimized:boolean; maximized:boolean; cascade:number; layer:number; dark?:boolean}>()
const emit=defineEmits<{activate:[];close:[];minimize:[];maximize:[];title:[title:string]}>()
const plugin=computed(()=>panelPlugins[props.panelId])
const panelProps=computed(()=>getPanelProps(props.panelId,props.context))
const listeners=computed(()=>getPanelListeners(props.panelId,props.context))
const root=ref<HTMLElement>(),bar=ref<HTMLElement>()
const geometry=ref({x:0,y:0,width:640,height:530})
function constrain(){
 const g=geometry.value,w=innerWidth,h=innerHeight
 g.width=Math.min(Math.max(280,g.width),Math.max(1,w-24))
 g.height=Math.min(Math.max(240,g.height),Math.max(1,h-100))
 g.x=Math.max(12,Math.min(w-g.width-12,g.x))
 g.y=Math.max(44,Math.min(h-g.height-48,g.y))
}
let drag:ReturnType<typeof interact>|undefined,resize:ReturnType<typeof interact>|undefined
onMounted(()=>{
 geometry.value.x=(innerWidth-geometry.value.width)/2+props.cascade*18
 geometry.value.y=64+props.cascade*16;constrain()
 if(bar.value)drag=interact(bar.value).draggable({ignoreFrom:'button',listeners:{move(e){if(!props.maximized){geometry.value.x+=e.dx;geometry.value.y+=e.dy;constrain()}}}})
 if(root.value)resize=interact(root.value).resizable({edges:{right:'.resize-handle',bottom:'.resize-handle'},listeners:{move(e){if(!props.maximized){geometry.value.width=e.rect.width;geometry.value.height=e.rect.height;constrain()}}}})
 window.addEventListener('resize',constrain)
})
watch(()=>props.active&&!props.minimized,async active=>{if(active){await nextTick();if(!root.value?.contains(document.activeElement))root.value?.focus()}},{immediate:true})
watch(()=>plugin.value.title,title=>emit('title',title),{immediate:true})
onBeforeUnmount(()=>{drag?.unset();resize?.unset();window.removeEventListener('resize',constrain)})
function key(e:KeyboardEvent){if(e.key==='Escape'&&!e.defaultPrevented){e.stopPropagation();emit('close')}}
const style=computed(()=>props.maximized?{zIndex:props.layer}:{left:geometry.value.x+'px',top:geometry.value.y+'px',width:geometry.value.width+'px',height:geometry.value.height+'px',zIndex:props.layer})
</script>
<template>
 <section v-show="!minimized" ref="root" class="tool-window" :class="{active,maximized,dark}" :style="style" role="dialog" :aria-label="plugin.title" tabindex="-1" @pointerdown="emit('activate')" @focusin="emit('activate')" @keydown="key">
  <header ref="bar" class="tool-title"><div class="traffic"><button aria-label="关闭窗口" class="close" @click="emit('close')"/><button aria-label="最小化窗口" class="minimize" @click="emit('minimize')"/><button :aria-label="maximized?'还原窗口':'最大化窗口'" class="maximize" @click="emit('maximize')"/></div><strong>{{plugin.title}}</strong><span>{{plugin.description}}</span></header>
  <div class="tool-content"><component :is="plugin.component" v-bind="panelProps" v-on="listeners"/></div>
  <span v-if="!maximized" class="resize-handle" aria-hidden="true"/>
 </section>
</template>
<style scoped>
.tool-window{position:fixed;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ui-border);border-radius:13px;background:var(--ui-panel);color:var(--ui-text);box-shadow:0 12px 40px #0004;font:13px system-ui,sans-serif}
.tool-window.active{box-shadow:0 28px 90px #0006}.tool-window.maximized{inset:58px 12px 60px;width:auto;height:auto}
.tool-title{display:flex;align-items:center;gap:16px;min-height:40px;padding:8px 14px;background:var(--ui-surface);border-bottom:1px solid var(--ui-border);touch-action:none;cursor:grab}.tool-title strong{white-space:nowrap}.tool-title>span{margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.65;font-size:11px}
.traffic{display:flex;gap:8px}.traffic button{width:12px;height:12px;border:0;border-radius:50%;cursor:pointer}.close{background:#ff5f57}.minimize{background:#febc2e}.maximize{background:#28c840}.tool-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}.resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,var(--ui-border) 51%,transparent 56%,transparent 67%,var(--ui-border) 68%,transparent 75%)}
@media(max-width:600px){.tool-title>span{display:none}}
</style>
