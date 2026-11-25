<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/auto-start'
import type { LauncherItem } from '../types'
import { launcherIcons } from '../components/launcherIcons'
import { Folder } from '@lucide/vue'
import { cell, resolvePoints, fitPoint, freshLayout, normalizeLayout, type DesktopLayout } from './layout'
const props = defineProps<{items: LauncherItem[]; workspaceId: string; layout?: DesktopLayout; folderShortcuts?: LauncherItem[]; dark?: boolean}>()
const emit = defineEmits<{open: [item: LauncherItem, event?: MouseEvent]; edit: [item: LauncherItem]; layout: [layout: DesktopLayout]; finder:[]; create:[]; remove:[item:LauncherItem]; membership:[item:LauncherItem,folderId:string]}>()
const surface = ref<HTMLElement>()
const selected = ref<string[]>([])
const menu = ref<{x:number;y:number;item?:LauncherItem}>()
const marquee=ref<{x:number;y:number;endX:number;endY:number}>()
let marqueePointer:number|undefined
function boxStart(e:PointerEvent){if(e.button!==0||e.target!==e.currentTarget)return;selected.value=[];menu.value=undefined;const el=surface.value;if(!el)return;const r=el.getBoundingClientRect();const x=e.clientX-r.left+el.scrollLeft,y=e.clientY-r.top+el.scrollTop;marquee.value={x,y,endX:x,endY:y};marqueePointer=e.pointerId;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
function boxMove(e:PointerEvent){if(!marquee.value||e.pointerId!==marqueePointer||!surface.value)return;const r=surface.value.getBoundingClientRect();const m=marquee.value;m.endX=e.clientX-r.left+surface.value.scrollLeft;m.endY=e.clientY-r.top+surface.value.scrollTop;selected.value=positions.value.filter(p=>p.point.x<Math.max(m.x,m.endX)&&p.point.x+cell>Math.min(m.x,m.endX)&&p.point.y<Math.max(m.y,m.endY)&&p.point.y+cell>Math.min(m.y,m.endY)).map(p=>p.item.id)}
function boxEnd(){marquee.value=undefined;marqueePointer=undefined}
const failedIcons = ref<Record<string,string>>({})
// Parent keys this component by workspace ID; each space has an independent record.
const layout = computed(() => props.layout ?? freshLayout())
function update(next: DesktopLayout) { emit('layout', next) }
function migrate() {
  if (props.layout) return
  try {
    const raw = localStorage.getItem('inftab.desktop.v1.' + encodeURIComponent(props.workspaceId))
    if (raw) update(normalizeLayout(JSON.parse(raw)))
  } catch { /* invalid legacy data is ignored */ }
}
const width = ref(960)
const height = ref(480)
const canvasHeight = computed(() => Math.max(height.value, Math.ceil(props.items.length / Math.max(1, Math.floor(width.value/cell)))*cell, ...props.items.map(item => (layout.value.positions[item.id]?.y ?? 0) + cell)))
const resolved = computed(() => resolvePoints(props.items.map(i=>i.id),layout.value.positions,width.value,canvasHeight.value))
const positions = computed(() => props.items.map(item => ({item,point:resolved.value[item.id]!})))
const renderedHeight = computed(() => Math.max(canvasHeight.value,...positions.value.map(p=>p.point.y+cell)))
let observer: ResizeObserver | undefined
let binding: ReturnType<typeof interact> | undefined
let dragging: {el: HTMLElement; id: string; x: number; y: number; moved: boolean} | undefined
let suppressUntil = 0
let suppressedId = ''
function save(id: string, x: number, y: number) {
  const point = fitPoint({x,y},width.value,renderedHeight.value,layout.value.snap)
  const occupied = positions.value.some(p => p.item.id !== id && Math.abs(p.point.x-point.x)<cell && Math.abs(p.point.y-point.y)<cell)
  if (occupied) return
  update({ ...layout.value, positions: { ...layout.value.positions, [id]: point } })
}
function activate(item: LauncherItem, event: MouseEvent) {
  if (item.id === suppressedId && performance.now() < suppressUntil && event.detail !== 0) return
  if(event.ctrlKey || event.metaKey){selected.value=selected.value.includes(item.id)?selected.value.filter(id=>id!==item.id):[...selected.value,item.id];return}
  selected.value=[item.id]
  if(event.detail===0 || event.button===1 || event.detail===2) emit('open',item,event)
}
function keyMove(event: KeyboardEvent,id: string) {
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selected.value=props.items.map(i=>i.id);return}
  if(event.key===' '){event.preventDefault();selected.value=selected.value.includes(id)?selected.value.filter(i=>i!==id):[...selected.value,id];return}
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const r=(event.currentTarget as HTMLElement).getBoundingClientRect();menu.value={x:r.left,y:r.bottom,item:props.items.find(i=>i.id===id)};return}
  if(!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();event.stopPropagation()
    const p=resolved.value[id];if(!p)return
    const dx=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0,dy=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0
    const candidates=positions.value.filter(q=>(q.point.x-p.x)*dx+(q.point.y-p.y)*dy>0).sort((a,b)=>Math.hypot(a.point.x-p.x,a.point.y-p.y)-Math.hypot(b.point.x-p.x,b.point.y-p.y))
    const next=candidates[0]?.item.id;if(next){surface.value?.querySelector<HTMLElement>('[data-item-id="'+CSS.escape(next)+'"]')?.focus();selected.value=event.shiftKey?[...new Set([...selected.value,id,next])]:[next]}return
  }
  if (!event.altKey || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const point = positions.value.find(p=>p.item.id===id)?.point
  if (!point) return
  const step = layout.value.snap ? cell : 8
  save(id,point.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),point.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0))
}
onMounted(() => {
  migrate()
  const root = surface.value
  if (!root) return
  const measure = () => { const w=root.clientWidth || 960, h=root.clientHeight || 480; if(w!==width.value || h!==height.value) cancelDrag(); width.value=w; height.value=h }
  measure()
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(root) }
  binding = interact('.desktop-icon', { context: root }).draggable({
    max: 1,
    listeners: {
      start(event) {
        const el = event.target as HTMLElement
        const id = el.dataset.itemId
        const point = positions.value.find(p=>p.item.id===id)?.point
        if (!id || !point) return
        dragging = {el,id,x:point.x,y:point.y,moved:false}
        el.style.zIndex='2'
      },
      move(event) {
        if (!dragging) return
        dragging.x += event.dx; dragging.y += event.dy; dragging.moved=true
        const p = fitPoint(dragging,width.value,renderedHeight.value)
        dragging.el.style.transform = 'translate('+p.x+'px,'+p.y+'px)'
      },
      end() {
        if (!dragging) return
        const d=dragging; dragging=undefined
        d.el.style.zIndex=''
        if (d.moved) {
          const source=props.items.find(i=>i.id===d.id)
          const target=positions.value.find(p=>p.item.folder && Math.abs(p.point.x-d.x)<40 && Math.abs(p.point.y-d.y)<40)
          if(source?.shortcut && target) emit('membership',source,target.item.id)
          else save(d.id,d.x,d.y)
          suppressedId=d.id; suppressUntil=performance.now()+300
        }
        requestAnimationFrame(() => { const p=positions.value.find(p=>p.item.id===d.id)?.point; if(p && d.el.isConnected) d.el.style.transform='translate('+p.x+'px,'+p.y+'px)' })
      },
    },
  })
})
function cancelDrag() {
  if (!dragging) return
  const d=dragging; dragging=undefined
  d.el.style.zIndex=''
  const p=positions.value.find(p=>p.item.id===d.id)?.point
  if (p) d.el.style.transform='translate('+p.x+'px,'+p.y+'px)'
  suppressedId=d.id; suppressUntil=performance.now()+300
}
function cancelKey(event: KeyboardEvent) { if(event.key==='Escape'){cancelDrag(); menu.value=undefined;selected.value=[]} }
function context(event:MouseEvent,item?:LauncherItem){menu.value={x:Math.min(event.clientX,innerWidth-180),y:Math.min(event.clientY,innerHeight-180),item}}
function menuAction(action:()=>void){menu.value=undefined;action()}
onMounted(() => { window.addEventListener('blur',cancelDrag); window.addEventListener('keydown',cancelKey); surface.value?.addEventListener('pointercancel',cancelDrag,true) })
onBeforeUnmount(() => { cancelDrag(); observer?.disconnect(); binding?.unset(); window.removeEventListener('blur',cancelDrag); window.removeEventListener('keydown',cancelKey); surface.value?.removeEventListener('pointercancel',cancelDrag,true) })
watch(() => props.items.map(i=>i.id), ids => {
  if (dragging && !ids.includes(dragging.id)) cancelDrag()
})
</script>
<template>
  <section class="desktop-shell" aria-label="自由桌面">
    <div class="desktop-toolbar">
      <span>桌面 · {{selected.length}} 项已选</span>
      <button type="button" @click="emit('finder')">Finder</button>
      <button type="button" :aria-pressed="layout.snap" @click="update({...layout,snap:!layout.snap})">网格吸附</button>
      <button type="button" @click="update({...layout,positions:{}})">整理图标</button>
    </div>
    <div ref="surface" class="desktop-surface" @click.self="selected=[];menu=undefined" @contextmenu.self.prevent="context($event)">
      <div class="desktop-canvas" @pointerdown="boxStart" @pointermove="boxMove" @pointerup="boxEnd" @pointercancel="boxEnd" @contextmenu.self.prevent="context($event)" :style="{height: renderedHeight+'px'}">
        <button v-for="{item,point} in positions" :key="item.id" type="button" class="desktop-icon" :class="{selected:selected.includes(item.id)}" :data-item-id="item.id" :style="{transform:'translate('+point.x+'px,'+point.y+'px)'}" :aria-label="item.title" @click="activate(item,$event)" @auxclick.middle.prevent="activate(item,$event)" @contextmenu.stop.prevent="context($event,item)" @keydown="keyMove($event,item.id)">
          <span class="desktop-symbol" :class="{builtin:item.action}" :data-action="item.action" :style="{background:item.action ? undefined : item.color}">
            <span v-if="item.folder" class="mac-folder"><Folder :size="56" fill="#72c7fa" color="#369bd7"/><span class="folder-count">{{item.folder.shortcutIds.length}}</span><span class="folder-preview"><i v-for="child in (folderShortcuts??[]).filter(c=>item.folder!.shortcutIds.includes(c.id)).slice(0,3)" :key="child.id" :style="{background:child.color}"/></span></span>
            <component v-else-if="item.action && launcherIcons[item.action]" :is="launcherIcons[item.action]" :size="30" :stroke-width="1.8"/>
            <img v-else-if="item.icon && failedIcons[item.id]!==item.icon" :src="item.icon" alt="" draggable="false" @error="failedIcons[item.id]=item.icon!"/>
            <span v-else>{{item.mark}}</span>
          </span>
          <span class="desktop-label">{{item.title}}</span>
        </button>
        <div v-if="marquee" class="desktop-marquee" :style="{left:Math.min(marquee.x,marquee.endX)+'px',top:Math.min(marquee.y,marquee.endY)+'px',width:Math.abs(marquee.endX-marquee.x)+'px',height:Math.abs(marquee.endY-marquee.y)+'px'}"/>
      </div>
    </div>
    <div v-if="menu" class="desktop-menu" :class="{dark}" :style="{left:menu.x+'px',top:menu.y+'px'}" role="menu">
      <button role="menuitem" @click="menuAction(()=>emit('create'))">新建文件夹</button>
      <button role="menuitem" @click="menuAction(()=>emit('finder'))">打开 Finder</button>
      <button role="menuitem" @click="menuAction(()=>update({...layout,positions:{}}))">整理图标</button>
      <template v-if="menu.item?.shortcut||menu.item?.folder"><button role="menuitem" @click="emit('edit',menu.item!);menu=undefined">编辑</button><button role="menuitem" @click="emit('remove',menu.item!);menu=undefined">删除</button></template>
    </div>
  </section>
</template>
<style scoped>
.desktop-shell{width:100%;min-width:0;color:#fff;flex:1;display:flex;flex-direction:column;min-height:0}
.desktop-toolbar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:#20283060;border:1px solid #ffffff26;border-radius:12px;backdrop-filter:blur(20px);margin-bottom:8px}
.desktop-toolbar span{margin-right:auto;font-size:14px;font-weight:600}
.desktop-toolbar button{border:1px solid #ffffff50;background:#18282070;color:white;border-radius:7px;padding:6px 10px;cursor:pointer}
.desktop-toolbar button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.desktop-surface{position:relative;flex:1;min-height:240px;overflow:auto}
.desktop-canvas{position:relative;min-width:100%}
.desktop-icon{position:absolute;top:0;left:0;width:96px;height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:0;background:none;color:white;touch-action:none;user-select:none;cursor:grab}
.desktop-icon:active{cursor:grabbing}
.desktop-icon:focus-visible{outline:2px solid white;outline-offset:-3px;border-radius:8px}
.desktop-symbol{width:56px;height:56px;border-radius:14px;border:1px solid #ffffff48;display:grid;place-items:center;overflow:hidden;color:white;box-shadow:0 4px 14px #0004,inset 0 1px 1px #ffffff50;font-size:24px}
.desktop-symbol.builtin{color:var(--builtin-ink,#6c8b7b);background:linear-gradient(150deg,#ffffff60,transparent 65%),var(--builtin-paper,#f4f8f3)}
.desktop-symbol img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.desktop-label{max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;text-shadow:0 1px 4px #000,0 1px 8px #000}
.desktop-icon.selected .desktop-symbol{outline:2px solid #90c9ff;outline-offset:3px}.desktop-icon.selected .desktop-label{background:#286fc9;border-radius:4px;padding:1px 5px}.desktop-symbol:has(.mac-folder){background:none!important;box-shadow:none;border:0;overflow:visible}.mac-folder{position:relative;display:grid;place-items:center}.folder-count{position:absolute;bottom:8px;font-size:12px;color:#164f76}.desktop-menu{position:fixed;z-index:18;background:#f5f5f7f5;color:#24272c;padding:5px;border:1px solid #fff8;border-radius:8px;box-shadow:0 12px 38px #0005;width:170px;backdrop-filter:blur(18px)}.desktop-menu button{display:block;width:100%;text-align:left;padding:7px 9px;background:none;border:0;border-radius:5px;color:inherit;cursor:pointer}.desktop-menu button:hover,.desktop-menu button:focus-visible{background:#2877d5;color:#fff}
.desktop-marquee{position:absolute;pointer-events:none;border:1px solid #93c9ff;background:#559aff30;z-index:4}.folder-preview{position:absolute;top:20px;display:flex;gap:2px}.folder-preview i{width:8px;height:8px;border-radius:2px;border:1px solid #fff8}@media(prefers-reduced-motion:no-preference){.desktop-icon.selected .desktop-symbol{transition:outline-color .12s}.finder{animation:finder-appear .15s ease-out}}
.desktop-menu.dark{background:#292c32f5;color:#eee;border-color:#ffffff25}
</style>
