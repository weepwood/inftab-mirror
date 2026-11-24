<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import interact from '@interactjs/interact'
import '@interactjs/actions/drag'
import '@interactjs/auto-start'
import type { LauncherItem } from '../types'
import { launcherIcons } from '../components/launcherIcons'
import { Folder } from '@lucide/vue'
import { cell, resolvePoints, fitPoint, freshLayout, normalizeLayout, type DesktopLayout } from './layout'
const props = defineProps<{items: LauncherItem[]; workspaceId: string; layout?: DesktopLayout}>()
const emit = defineEmits<{open: [item: LauncherItem, event?: MouseEvent]; edit: [item: LauncherItem]; layout: [layout: DesktopLayout]}>()
const surface = ref<HTMLElement>()
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
function save(id: string, x: number, y: number) {
  const point = fitPoint({x,y},width.value,renderedHeight.value,layout.value.snap)
  const occupied = positions.value.some(p => p.item.id !== id && Math.abs(p.point.x-point.x)<cell && Math.abs(p.point.y-point.y)<cell)
  if (occupied) return
  update({ ...layout.value, positions: { ...layout.value.positions, [id]: point } })
}
function activate(item: LauncherItem, event: MouseEvent) {
  if (performance.now() < suppressUntil && event.detail !== 0) return
  emit('open',item,event)
}
function keyMove(event: KeyboardEvent,id: string) {
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
        if (d.moved) { save(d.id,d.x,d.y); suppressUntil=performance.now()+300 }
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
  suppressUntil=performance.now()+300
}
function cancelKey(event: KeyboardEvent) { if(event.key==='Escape') cancelDrag() }
onMounted(() => { window.addEventListener('blur',cancelDrag); window.addEventListener('keydown',cancelKey); surface.value?.addEventListener('pointercancel',cancelDrag,true) })
onBeforeUnmount(() => { cancelDrag(); observer?.disconnect(); binding?.unset(); window.removeEventListener('blur',cancelDrag); window.removeEventListener('keydown',cancelKey); surface.value?.removeEventListener('pointercancel',cancelDrag,true) })
watch(() => props.items.map(i=>i.id), ids => {
  if (dragging && !ids.includes(dragging.id)) cancelDrag()
})
</script>
<template>
  <section class="desktop-shell" aria-label="自由桌面">
    <div class="desktop-toolbar">
      <span>桌面</span>
      <button type="button" :aria-pressed="layout.snap" @click="update({...layout,snap:!layout.snap})">网格吸附</button>
      <button type="button" @click="update({...layout,positions:{}})">整理图标</button>
    </div>
    <div ref="surface" class="desktop-surface">
      <div class="desktop-canvas" :style="{height: renderedHeight+'px'}">
        <button v-for="{item,point} in positions" :key="item.id" type="button" class="desktop-icon" :data-item-id="item.id" :style="{transform:'translate('+point.x+'px,'+point.y+'px)'}" :aria-label="item.title" @click="activate(item,$event)" @auxclick.middle.prevent="activate(item,$event)" @contextmenu.prevent="emit('edit',item)" @keydown="keyMove($event,item.id)">
          <span class="desktop-symbol" :class="{builtin:item.action}" :data-action="item.action" :style="{background:item.action ? undefined : item.color}">
            <component :is="Folder" v-if="item.folder" :size="30"/>
            <component v-else-if="item.action && launcherIcons[item.action]" :is="launcherIcons[item.action]" :size="30" :stroke-width="1.8"/>
            <img v-else-if="item.icon && failedIcons[item.id]!==item.icon" :src="item.icon" alt="" draggable="false" @error="failedIcons[item.id]=item.icon!"/>
            <span v-else>{{item.mark}}</span>
          </span>
          <span class="desktop-label">{{item.title}}</span>
        </button>
      </div>
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
</style>
