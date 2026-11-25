<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PanelLeft, PanelRight } from '@lucide/vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/actions/resize'
import '@interactjs/auto-start'
import { fitWindow, dockWindow, readGeometry, saveGeometry, type WindowGeometry, type WindowSnap } from './windowGeometry'
const props=defineProps<{kind:'finder'|'tool'; title:string; description?:string; label:string; geometryKey:string; active:boolean; minimized:boolean; maximized:boolean; cascade:number; layer:number; dark?:boolean; hidden?:boolean}>()
const emit=defineEmits<{activate:[];close:[];minimize:[];maximize:[];keydown:[event:KeyboardEvent]}>()
const root=ref<HTMLElement>(),bar=ref<HTMLElement>(),snap=ref<WindowSnap>(null)
const preferred=ref<WindowGeometry>({x:12,y:64,width:props.kind==='finder'?850:640,height:props.kind==='finder'?570:530})
const viewport=ref({w:innerWidth,h:innerHeight})
const fitted=computed(()=>props.maximized?fitWindow({x:12,y:48,width:viewport.value.w-24,height:viewport.value.h-96},viewport.value.w,viewport.value.h):snap.value?dockWindow(snap.value,viewport.value.w,viewport.value.h):fitWindow(preferred.value,viewport.value.w,viewport.value.h))
const style=computed(()=>({left:fitted.value.x+'px',top:fitted.value.y+'px',width:fitted.value.width+'px',height:fitted.value.height+'px',zIndex:props.layer}))
let drag:ReturnType<typeof interact>|undefined,resize:ReturnType<typeof interact>|undefined
let gesture:WindowGeometry|undefined,original:WindowGeometry|undefined
function onResize(){cancel();viewport.value={w:innerWidth,h:innerHeight}}
function start(){if(props.maximized||snap.value)return;original={...preferred.value};gesture={...fitted.value}}
function move(dx:number,dy:number,resizeMode=false){
 if(!gesture)return
 gesture=resizeMode?{...gesture,width:gesture.width+dx,height:gesture.height+dy}:{...gesture,x:gesture.x+dx,y:gesture.y+dy}
 preferred.value=fitWindow(gesture,viewport.value.w,viewport.value.h)
}
function end(){if(!gesture)return;gesture=undefined;original=undefined;try{saveGeometry(props.geometryKey,preferred.value,sessionStorage)}catch{/* denied storage */}}
function cancel(){if(original)preferred.value=original;gesture=undefined;original=undefined}
function toggleSnap(side:Exclude<WindowSnap,null>){if(props.maximized)emit('maximize');snap.value=snap.value===side?null:side}
function maximize(){snap.value=null;emit('maximize')}
function handleKey(e:KeyboardEvent){
 emit('keydown',e)
 if(e.defaultPrevented||e.cancelBubble||e.isComposing||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return
 if(e.key==='Escape'){
  if(gesture){cancel();e.preventDefault();e.stopPropagation()}
  else{e.stopPropagation();emit('close')}
 }
}
onMounted(()=>{
 let saved:WindowGeometry|undefined
 try{saved=readGeometry(props.geometryKey,sessionStorage)}catch{/* denied storage */}
 preferred.value=saved??{...preferred.value,x:(innerWidth-preferred.value.width)/2+props.cascade*18,y:64+props.cascade*16}
 if(bar.value)drag=interact(bar.value).draggable({ignoreFrom:'button',listeners:{start,move(e){move(e.dx,e.dy)},end}})
 if(root.value)resize=interact(root.value).resizable({edges:{right:'.resize-handle',bottom:'.resize-handle'},listeners:{start,move(e){move(e.deltaRect.width,e.deltaRect.height,true)},end}})
 window.addEventListener('resize',onResize);window.addEventListener('blur',cancel)
 root.value?.addEventListener('pointercancel',cancel,true)
})
watch(()=>props.active&&!props.minimized&&!props.hidden,async active=>{if(active){await nextTick();if(!root.value?.contains(document.activeElement))root.value?.focus()}},{immediate:true})
onBeforeUnmount(()=>{drag?.unset();resize?.unset();window.removeEventListener('resize',onResize);window.removeEventListener('blur',cancel);root.value?.removeEventListener('pointercancel',cancel,true)})
</script>
<template>
 <section v-show="!minimized&&!hidden" ref="root" class="window-frame" :class="[kind==='finder'?'finder':'tool-window',{active,maximized,dark,snapped:!!snap}]" :style="style" role="dialog" :aria-label="label" tabindex="-1" @pointerdown="emit('activate')" @focusin="emit('activate')" @keydown="handleKey">
  <header ref="bar" class="window-title" :class="kind==='finder'?'finder-title':'tool-title'">
   <div class="traffic"><button :aria-label="kind==='finder'?'关闭 Finder':'关闭窗口'" class="close" @click="emit('close')"/><button :aria-label="kind==='finder'?'最小化 Finder':'最小化窗口'" class="minimize" @click="emit('minimize')"/><button :aria-label="(maximized?'还原':'最大化')+(kind==='finder'?' Finder':'窗口')" class="maximize" @click="maximize"/></div>
   <strong>{{title}}</strong><span class="window-description">{{description}}</span>
   <div class="snap-controls"><button type="button" aria-label="左侧停靠" :aria-pressed="snap==='left'" @click="toggleSnap('left')"><PanelLeft :size="15"/></button><button type="button" aria-label="右侧停靠" :aria-pressed="snap==='right'" @click="toggleSnap('right')"><PanelRight :size="15"/></button></div>
  </header>
  <slot/>
  <span v-show="!maximized&&!snap" class="resize-handle" aria-hidden="true"/>
 </section>
</template>
<style scoped>
.window-frame{position:fixed;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ui-border);border-radius:13px;background:var(--ui-panel);color:var(--ui-text);box-shadow:0 12px 40px #0004;font:13px system-ui,sans-serif;box-sizing:border-box}
.window-frame.active{box-shadow:0 28px 90px #0006}.window-frame.finder{background:#f9f9fb;color:#25282e}.window-frame.finder.dark{background:#25272c;color:#eee;border-color:#ffffff25}
.window-title{display:flex;align-items:center;gap:12px;min-height:40px;padding:7px 14px;background:var(--ui-surface);border-bottom:1px solid var(--ui-border);touch-action:none;cursor:grab}.window-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.window-description{margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.65;font-size:11px}
.traffic{display:flex;gap:8px;flex-shrink:0}.traffic button{width:12px;height:12px;border:0;border-radius:50%;cursor:pointer}.close{background:#ff5f57}.minimize{background:#febc2e}.maximize{background:#28c840}.snap-controls{display:flex;gap:2px;flex-shrink:0;margin-left:auto}.snap-controls button{border:0;border-radius:4px;background:transparent;color:inherit;font-size:16px;cursor:pointer;display:grid;place-items:center;padding:4px 5px}.snap-controls button:hover,.snap-controls button[aria-pressed=true]{background:var(--ui-accent-soft)}
.window-title button:focus-visible{outline:2px solid var(--ui-accent-text);outline-offset:2px}.resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,var(--ui-border) 51%,transparent 56%,transparent 67%,var(--ui-border) 68%,transparent 75%)}
@media(max-width:600px){.window-description{display:none}.window-title{padding-inline:8px;gap:8px}}
</style>
