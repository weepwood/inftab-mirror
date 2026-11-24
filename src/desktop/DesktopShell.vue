<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import interact from 'interactjs'
import type { LauncherItem } from '../types'
import { launcherIcons } from '../components/launcherIcons'
import { Folder } from '@lucide/vue'
import { useStoredState } from '../composables/useStoredState'
import { cell, defaultPoint, fitPoint, freshLayout, normalizeLayout } from './layout'
const props = defineProps<{items: LauncherItem[]; workspaceId: string}>()
const emit = defineEmits<{open: [item: LauncherItem, event?: MouseEvent]; edit: [item: LauncherItem]}>()
const surface = ref<HTMLElement>()
// Parent keys this component by workspace ID; each space has an independent record.
const layout = useStoredState('inftab.desktop.v1.' + encodeURIComponent(props.workspaceId), freshLayout(), normalizeLayout)
const width = ref(960)
const height = ref(480)
const canvasHeight = computed(() => Math.max(height.value, Math.ceil(props.items.length / Math.max(1, Math.floor(width.value/cell)))*cell, ...props.items.map(item => (layout.value.positions[item.id]?.y ?? 0) + cell)))
const positions = computed(() => props.items.map((item,i) => ({item, point: fitPoint(layout.value.positions[item.id] ?? defaultPoint(i,Math.min(width.value,960)),width.value,canvasHeight.value)})))
let observer: ResizeObserver | undefined
let binding: ReturnType<typeof interact> | undefined
let dragging: {el: HTMLElement; id: string; x: number; y: number; moved: boolean} | undefined
let suppressUntil = 0
function save(id: string, x: number, y: number) {
  layout.value.positions[id] = fitPoint({x,y},width.value,canvasHeight.value,layout.value.snap)
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
  const root = surface.value
  if (!root) return
  const measure = () => { width.value = root.clientWidth || 960; height.value = root.clientHeight || 480 }
  measure()
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(root) }
  binding = interact('.desktop-icon', { context: root }).draggable({
    inertia: false,
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
        const p = fitPoint(dragging,width.value,canvasHeight.value)
        dragging.el.style.transform = 'translate('+p.x+'px,'+p.y+'px)'
      },
      end() {
        if (!dragging) return
        const d=dragging; dragging=undefined
        d.el.style.zIndex=''
        if (d.moved) { save(d.id,d.x,d.y); suppressUntil=performance.now()+300 }
        const p=positions.value.find(p=>p.item.id===d.id)?.point
        if(p) d.el.style.transform='translate('+p.x+'px,'+p.y+'px)'
      },
    },
  })
})
onBeforeUnmount(() => { observer?.disconnect(); binding?.unset() })
watch(() => props.items.map(i=>i.id), ids => {
  if (dragging && !ids.includes(dragging.id)) dragging=undefined
})
</script>
<template>
  <section class="desktop-shell" aria-label="自由桌面">
    <div class="desktop-toolbar">
      <span>桌面</span>
      <button type="button" :aria-pressed="layout.snap" @click="layout.snap=!layout.snap">网格吸附</button>
      <button type="button" @click="layout.positions=Object.create(null)">整理图标</button>
    </div>
    <div ref="surface" class="desktop-surface">
      <div class="desktop-canvas" :style="{height: canvasHeight+'px'}">
        <button v-for="{item,point} in positions" :key="item.id" type="button" class="desktop-icon" :data-item-id="item.id" :style="{transform:'translate('+point.x+'px,'+point.y+'px)'}" :aria-label="item.title" @click="activate(item,$event)" @auxclick.middle.prevent="activate(item,$event)" @contextmenu.prevent="emit('edit',item)" @keydown="keyMove($event,item.id)">
          <span class="desktop-symbol" :style="{background:item.color}">
            <component :is="Folder" v-if="item.folder" :size="30"/>
            <img v-else-if="item.icon" :src="item.icon" alt="" draggable="false" @error="($event.target as HTMLImageElement).style.display='none'"/>
            <component :is="launcherIcons[item.id]" v-else-if="launcherIcons[item.id]" :size="30"/>
            <span v-else>{{item.mark}}</span>
          </span>
          <span class="desktop-label">{{item.title}}</span>
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.desktop-shell{width:100%;min-width:0;color:#fff}
.desktop-toolbar{display:flex;align-items:center;gap:8px;padding:8px 0}
.desktop-toolbar span{margin-right:auto;font-size:14px;font-weight:600}
.desktop-toolbar button{border:1px solid #ffffff50;background:#18282070;color:white;border-radius:7px;padding:6px 10px;cursor:pointer}
.desktop-toolbar button[aria-pressed=true]{background:var(--ui-accent-soft);color:var(--ui-accent-text)}
.desktop-surface{position:relative;height:clamp(240px,55vh,720px);overflow:auto}
.desktop-canvas{position:relative;min-width:100%}
.desktop-icon{position:absolute;top:0;left:0;width:96px;height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:0;background:none;color:white;touch-action:none;user-select:none;cursor:grab}
.desktop-icon:active{cursor:grabbing}
.desktop-icon:focus-visible{outline:2px solid white;outline-offset:-3px;border-radius:8px}
.desktop-symbol{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;overflow:hidden;color:white;box-shadow:0 3px 12px #0003;font-size:24px}
.desktop-symbol img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.desktop-label{max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;text-shadow:0 1px 4px #000,0 1px 8px #000}
</style>
