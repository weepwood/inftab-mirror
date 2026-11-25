<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PanelLeft, PanelRight } from '@lucide/vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/actions/resize'
import '@interactjs/auto-start'
import { fitWindow, dockWindow, resizeWindow, readGeometry, saveGeometry, type WindowGeometry, type WindowSnap, type ResizeEdges } from './windowGeometry'
const props=defineProps<{kind:'finder'|'tool'; title:string; description?:string; label:string; geometryKey:string; active:boolean; minimized:boolean; maximized:boolean; cascade:number; layer:number; dark?:boolean; hidden?:boolean}>()
const emit=defineEmits<{activate:[];close:[];minimize:[];maximize:[];keydown:[event:KeyboardEvent]}>()
const root=ref<HTMLElement>(),bar=ref<HTMLElement>(),snap=ref<WindowSnap>(null)
const preferred=ref<WindowGeometry>({x:12,y:64,width:props.kind==='finder'?850:640,height:props.kind==='finder'?570:530})
const preview=ref<WindowSnap>(null)
const viewport=ref({w:innerWidth,h:innerHeight})
const fitted=computed(()=>props.maximized?fitWindow({x:12,y:48,width:viewport.value.w-24,height:viewport.value.h-96},viewport.value.w,viewport.value.h):snap.value?dockWindow(snap.value,viewport.value.w,viewport.value.h):fitWindow(preferred.value,viewport.value.w,viewport.value.h))
const previewStyle=computed(()=>{const g=dockWindow(preview.value??'left',viewport.value.w,viewport.value.h);return {left:g.x+'px',top:g.y+'px',width:g.width+'px',height:g.height+'px',zIndex:props.layer}})
const style=computed(()=>({left:fitted.value.x+'px',top:fitted.value.y+'px',width:fitted.value.width+'px',height:fitted.value.height+'px',zIndex:props.layer}))
let drag:ReturnType<typeof interact>|undefined,resize:ReturnType<typeof interact>|undefined
let gesture:WindowGeometry|undefined,original:WindowGeometry|undefined
let delta={left:0,right:0,top:0,bottom:0}
function onResize(){cancel();viewport.value={w:innerWidth,h:innerHeight}}
function start(){if(!props.active||props.minimized||props.hidden||props.maximized||snap.value||root.value?.closest('[inert]'))return;original={...preferred.value};gesture={...fitted.value};delta={left:0,right:0,top:0,bottom:0}}
function move(dx:number,dy:number,x:number){
 if(!gesture)return
 if(root.value?.closest('[inert]'))return cancel()
 gesture={...gesture,x:gesture.x+dx,y:gesture.y+dy}
 preferred.value=fitWindow(gesture,viewport.value.w,viewport.value.h)
 preview.value=viewport.value.w>=600?(x<=20?'left':x>=viewport.value.w-20?'right':null):null
}
function resizing(change:typeof delta,edges:ResizeEdges){
 if(!gesture)return
 if(root.value?.closest('[inert]'))return cancel()
 delta.left+=change.left;delta.right+=change.right;delta.top+=change.top;delta.bottom+=change.bottom
 preferred.value=resizeWindow(gesture,delta,edges,viewport.value.w,viewport.value.h)
}
function end(){
 if(!gesture)return
 if(root.value?.closest('[inert]'))return cancel()
 if(preview.value){snap.value=preview.value;if(original)preferred.value=original}
 else try{saveGeometry(props.geometryKey,preferred.value,sessionStorage)}catch{/* denied storage */}
 gesture=undefined;original=undefined;preview.value=null
}
function cancel(){if(original)preferred.value=original;gesture=undefined;original=undefined;preview.value=null}
function toggleSnap(side:Exclude<WindowSnap,null>){cancel();if(props.maximized)emit('maximize');snap.value=snap.value===side?null:side}
function maximize(){cancel();snap.value=null;emit('maximize')}
function titleDoubleClick(e:MouseEvent){
 if(!(e.target as Element)?.closest('button'))maximize()
}
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
 if(bar.value)drag=interact(bar.value).draggable({mouseButtons:1,ignoreFrom:'button',listeners:{start,move(e){move(e.dx,e.dy,e.clientX)},end}})
 if(root.value)resize=interact(root.value).resizable({mouseButtons:1,edges:{left:'.resize-w,.resize-nw,.resize-sw',right:'.resize-e,.resize-ne,.resize-handle',top:'.resize-n,.resize-nw,.resize-ne',bottom:'.resize-s,.resize-sw,.resize-handle'},listeners:{start,move(e){resizing(e.deltaRect,e.edges)},end}})
 window.addEventListener('resize',onResize);window.addEventListener('blur',cancel)
 root.value?.addEventListener('pointercancel',cancel,true)
})
watch(()=>props.active&&!props.minimized&&!props.hidden,async active=>{if(!active)cancel();if(active){await nextTick();if(root.value&&!root.value.closest('[inert]')&&!root.value.contains(document.activeElement))root.value.focus({preventScroll:true})}},{immediate:true})
onBeforeUnmount(()=>{drag?.unset();resize?.unset();window.removeEventListener('resize',onResize);window.removeEventListener('blur',cancel);root.value?.removeEventListener('pointercancel',cancel,true)})
</script>
<template>
 <div v-if="preview" class="window-snap-preview" aria-hidden="true" :style="previewStyle"/>
 <Transition name="mac-window" appear>
 <section v-show="!minimized&&!hidden" ref="root" class="window-frame" :class="[kind==='finder'?'finder':'tool-window',{active,maximized,dark,snapped:!!snap}]" :style="style" role="dialog" :aria-label="label" :aria-hidden="minimized||hidden||undefined" :inert="(minimized||hidden)||undefined" tabindex="-1" @pointerdown="emit('activate')" @focusin="emit('activate')" @keydown="handleKey">
  <header ref="bar" @dblclick="titleDoubleClick" class="window-title" :class="kind==='finder'?'finder-title':'tool-title'">
   <div class="traffic"><button type="button" :aria-label="kind==='finder'?'关闭 Finder':'关闭窗口'" class="close" @click="emit('close')"/><button type="button" :aria-label="kind==='finder'?'最小化 Finder':'最小化窗口'" class="minimize" @click="emit('minimize')"/><button type="button" :aria-label="(maximized?'还原':'最大化')+(kind==='finder'?' Finder':'窗口')" class="maximize" @click="maximize"/></div>
   <strong>{{title}}</strong><span class="window-description">{{description}}</span>
   <div class="snap-controls"><button type="button" aria-label="左侧停靠" :aria-pressed="snap==='left'" @click="toggleSnap('left')"><PanelLeft :size="15"/></button><button type="button" aria-label="右侧停靠" :aria-pressed="snap==='right'" @click="toggleSnap('right')"><PanelRight :size="15"/></button></div>
  </header>
  <slot/>
  <template v-if="!maximized&&!snap"><span v-for="edge in ['n','s','w','e','nw','ne','sw','handle']" :key="edge" :class="'resize-'+edge" class="window-resize-edge" aria-hidden="true"/></template>
 </section>
 </Transition>
</template>
<style scoped>
.window-frame{position:fixed;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--mac-line);border-radius:12px;background:var(--mac-window);color:var(--mac-ink);box-shadow:var(--mac-shadow);font:13px var(--mac-font);box-sizing:border-box}
.window-frame.active{box-shadow:var(--mac-shadow-active)}.window-frame:not(.active) .window-title{background:var(--mac-window);color:var(--mac-muted)}.window-frame.finder{background:var(--mac-window);color:var(--mac-ink)}.window-frame.maximized{border-radius:8px}
.window-title{display:flex;align-items:center;gap:12px;min-height:40px;padding:7px 14px;background:var(--mac-toolbar);border-bottom:1px solid var(--mac-line);touch-action:none;cursor:grab}.window-title strong{min-width:0;flex-shrink:1;font-size:13px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.window-description{min-width:0;flex-shrink:2;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.65;font-size:11px}
.traffic{display:flex;gap:8px;flex-shrink:0}.traffic button{position:relative;width:12px;height:12px;padding:0;border:1px solid #0002;border-radius:50%;cursor:pointer}.window-frame:not(.active) .traffic button{background:#a0a0a5}.window-frame:not(.active) .traffic:hover .close{background:#ff5f57}.window-frame:not(.active) .traffic:hover .minimize{background:#febc2e}.window-frame:not(.active) .traffic:hover .maximize{background:#28c840}.traffic:hover button::after,.traffic button:focus-visible::after{position:absolute;inset:0;display:grid;place-items:center;color:#0009;font:10px/1 var(--mac-font);font-weight:700}.traffic .close::after{content:"×"}.traffic .minimize::after{content:"−"}.traffic .maximize::after{content:"+"}.close{background:#ff5f57}.minimize{background:#febc2e}.maximize{background:#28c840}.snap-controls{display:flex;gap:2px;flex-shrink:0;margin-left:auto}.snap-controls button{border:0;border-radius:4px;background:transparent;color:inherit;font-size:16px;cursor:pointer;display:grid;place-items:center;padding:4px 5px}.snap-controls button:hover,.snap-controls button[aria-pressed=true]{background:var(--mac-selection-soft);color:var(--mac-ink)}
.window-title button:focus-visible{outline:2px solid var(--ui-accent-text);outline-offset:2px}.resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,var(--ui-border) 51%,transparent 56%,transparent 67%,var(--ui-border) 68%,transparent 75%)}
.window-snap-preview{position:fixed;pointer-events:none;border:2px solid var(--mac-selection);background:var(--mac-selection-soft);opacity:.45;border-radius:12px}
.window-resize-edge{position:absolute;z-index:3;touch-action:none}
.resize-n,.resize-s{height:5px;left:14px;right:14px;cursor:ns-resize}.resize-n{top:0}.resize-s{bottom:0}
.resize-w,.resize-e{width:5px;top:14px;bottom:14px;cursor:ew-resize}.resize-w{left:0}.resize-e{right:0}
.resize-nw,.resize-ne,.resize-sw{width:14px;height:14px}.resize-nw{top:0;left:0;cursor:nwse-resize}.resize-ne{top:0;right:0;cursor:nesw-resize}.resize-sw{bottom:0;left:0;cursor:nesw-resize}
@media(pointer:coarse){.traffic{gap:4px}.traffic button{width:24px;height:24px}.snap-controls button{min-width:32px;min-height:32px}}
@media(max-width:600px){.window-description{display:none}.window-title{padding-inline:8px;gap:8px}}

@media(prefers-reduced-motion:no-preference){
 .mac-window-enter-active{transition:opacity .14s ease-out}
 .mac-window-enter-from{opacity:0}
 .mac-window-leave-active{transition:opacity .1s ease-in;pointer-events:none}
 .mac-window-leave-to{opacity:0}
}
</style>
