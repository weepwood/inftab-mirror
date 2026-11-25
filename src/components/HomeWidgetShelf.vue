<script setup lang="ts">
import { computed, ref } from 'vue'
import { resolveWidgetSlots, canPlaceWidget, widgetSpan, type WidgetSlots } from '../data/widgetSlots'
import type { Point } from '../desktop/layout'
import { ArrowDown, ArrowUp, GripVertical, X } from '@lucide/vue'
import { getHomeWidgetListeners, getHomeWidgetProps, homeWidgetPlugins, type HomeWidgetContext, type HomeWidgetPluginRegistry } from '../plugins/widgetRegistry'
import type { PanelId } from '../plugins/registry'
import type { HomeWidgetId, HomeWidgetSize } from '../types'

const props = withDefaults(defineProps<{
  widgetIds: HomeWidgetId[]
  widgetSizes: Record<HomeWidgetId, HomeWidgetSize>
  context: HomeWidgetContext
  desktopLayout?: boolean
  canvasMode?: boolean
  widgetSlots?: WidgetSlots
  plugins?: HomeWidgetPluginRegistry
}>(), { plugins: () => homeWidgetPlugins })
const emit = defineEmits<{
  open: [panel: PanelId]
  remove: [id: HomeWidgetId]
  reorder: [from: number, to: number]
  resize: [id: HomeWidgetId, size: HomeWidgetSize]
  slots: [slots: WidgetSlots|undefined]
  canvas: []
}>()
const draggingIndex = ref<number | null>(null)
const moveAnnouncement = ref('')
const free=computed(()=>props.desktopLayout&&props.widgetSlots!==undefined)
const slots=computed(()=>resolveWidgetSlots(props.widgetIds,props.widgetSlots??{},props.widgetSizes))
const emptySlots=computed(()=>{
 if(!free.value)return []
 const height=Math.min(16,Math.max(1,...Object.values(slots.value).map(p=>p.y+1))+(draggingIndex.value===null?0:1))
 return Array.from({length:height*3},(_,i)=>({x:i%3,y:Math.floor(i/3)})).filter(p=>!Object.entries(slots.value).some(([id,q])=>q.y===p.y&&q.x<=p.x&&q.x+widgetSpan(props.widgetSizes[id as HomeWidgetId])>p.x))
})
function place(id:HomeWidgetId,p:Point){
 if(!canPlaceWidget(id,p,slots.value,props.widgetSizes)){moveAnnouncement.value='目标位置已占用或超出范围。';return}
 emit('slots',{...slots.value,[id]:p})
 moveAnnouncement.value=props.plugins[id].title+'已移动。'
}
function freeKey(e:KeyboardEvent,id:HomeWidgetId){
 if(!free.value||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return
 e.preventDefault()
 const p=slots.value[id]
 if(p)place(id,{x:p.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0),y:p.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)})
}
function freeDrop(e:DragEvent,p:Point){
 e.preventDefault()
 const id=draggingIndex.value===null?undefined:props.widgetIds[draggingIndex.value]
 if(id)place(id,p)
 draggingIndex.value=null
}
function cardStyle(id:HomeWidgetId){
 const p=slots.value[id]
 return free.value&&p?{gridColumn:(p.x+1)+' / span '+widgetSpan(props.widgetSizes[id]),gridRow:String(p.y+1)}:undefined
}

function reorderWidget(from: number, to: number) {
  const id = props.widgetIds[from]
  if (!id || to < 0 || to >= props.widgetIds.length || from === to) return
  emit('reorder', from, to)
  moveAnnouncement.value = `${props.plugins[id].title}已移到第${to + 1}个位置。`
}

function openWidget(id: HomeWidgetId) {
  const panel = props.plugins[id].panel
  if (panel) emit('open', panel)
}

function startDrag(event: DragEvent, index: number) {
  draggingIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function dropWidget(event: DragEvent, targetIndex: number) {
  event.preventDefault()
  const transferIndex = event.dataTransfer?.getData('text/plain') ?? ''
  const sourceIndex = draggingIndex.value ?? (transferIndex ? Number(transferIndex) : Number.NaN)
  if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < props.widgetIds.length) reorderWidget(sourceIndex, targetIndex)
  draggingIndex.value = null
}

function moveWidget(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex >= 0 && targetIndex < props.widgetIds.length) reorderWidget(index, targetIndex)
}

function nextWidgetSize(size: HomeWidgetSize): HomeWidgetSize {
  if (size === 'standard') return 'wide'
  if (size === 'wide') return 'full'
  return 'standard'
}

function widgetSizeActionLabel(id: HomeWidgetId) {
  const size = props.widgetSizes[id]
  if (size === 'standard') return `将${props.plugins[id].title}加宽`
  if (size === 'wide') return `将${props.plugins[id].title}扩展为整行`
  return `将${props.plugins[id].title}恢复标准宽度`
}

function widgetSizeButtonText(size: HomeWidgetSize) {
  if (size === 'standard') return '加宽'
  if (size === 'wide') return '整行'
  return '标准'
}
</script>

<template>
  <section class="home-widget-shelf" :class="{'widget-free':free}" aria-label="首页小组件">
    <button v-if="desktopLayout" class="widget-layout-toggle" type="button" :aria-pressed="free" @click="canvasMode?emit('canvas'):emit('slots',free?undefined:{})">{{canvasMode?'移出桌面画布':free?'自动排列小组件':'自由排布小组件'}}</button>
    <button v-if="desktopLayout&&free&&!canvasMode" class="widget-canvas-toggle" type="button" @click="emit('canvas')">放入桌面画布</button>
    <span class="visually-hidden" role="status" aria-live="polite">{{ moveAnnouncement }}</span>
    <div v-for="p in emptySlots" :key="'slot:'+p.x+':'+p.y" class="widget-drop-slot" :class="{ready:draggingIndex!==null&&canPlaceWidget(widgetIds[draggingIndex]!,p,slots,widgetSizes)}" :style="{gridColumn:String(p.x+1),gridRow:String(p.y+1)}" aria-hidden="true" @dragover.prevent @drop="freeDrop($event,p)" />
    <article
      v-for="(id, index) in widgetIds"
      :key="id"
      class="home-widget-card"
      :data-widget-id="id"
      :style="cardStyle(id)"
      :class="{ dragging: draggingIndex === index, 'home-widget-card-wide': widgetSizes[id] === 'wide', 'home-widget-card-full': widgetSizes[id] === 'full' }"
      @dragover.prevent
      @drop="free&&slots[id]?freeDrop($event,slots[id]!):dropWidget($event, index)"
      @dragend="draggingIndex = null"
    >
      <header class="home-widget-header">
        <button class="home-widget-grip" type="button" draggable="true" :aria-label="free?`移动${props.plugins[id].title}，可使用方向键`:`拖动${props.plugins[id].title}排序`" @keydown="freeKey($event,id)" @dragstart="startDrag($event, index)">
          <GripVertical :size="15" aria-hidden="true" />
        </button>
        <button v-if="props.plugins[id].panel" class="home-widget-title" type="button" :aria-label="`打开${props.plugins[id].title}`" @click="openWidget(id)">
          {{ props.plugins[id].title }}
        </button>
        <span v-else class="home-widget-title home-widget-title-static">{{ props.plugins[id].title }}</span>
        <button v-if="!free" class="home-widget-order" type="button" :disabled="index === 0" :aria-label="`将${props.plugins[id].title}上移`" @click="moveWidget(index, -1)"><ArrowUp :size="14" /></button>
        <button v-if="!free" class="home-widget-order" type="button" :disabled="index === widgetIds.length - 1" :aria-label="`将${props.plugins[id].title}下移`" @click="moveWidget(index, 1)"><ArrowDown :size="14" /></button>
        <button class="home-widget-size" type="button" :aria-label="widgetSizeActionLabel(id)" @click="emit('resize', id, nextWidgetSize(widgetSizes[id]))">{{ widgetSizeButtonText(widgetSizes[id]) }}</button>
        <button class="home-widget-remove" type="button" :aria-label="`移除${props.plugins[id].title}`" @click="emit('remove', id)"><X :size="15" /></button>
      </header>
      <component :is="props.plugins[id].component" v-bind="getHomeWidgetProps(id, context, props.plugins)" v-on="getHomeWidgetListeners(id, context, props.plugins)" />
    </article>
  </section>
</template>
<style scoped>
.widget-layout-toggle,.widget-canvas-toggle{grid-column:1/-1;justify-self:start;font:inherit;font-size:12px;border:1px solid var(--mac-line);border-radius:6px;padding:5px 10px;background:var(--mac-window);color:var(--mac-ink);cursor:pointer}
.widget-free{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(112px,auto);position:relative;padding-top:36px;align-items:stretch}
.widget-free .widget-layout-toggle,.widget-free .widget-canvas-toggle{position:absolute;top:0;left:0}.widget-free .widget-canvas-toggle{left:130px}
.widget-drop-slot{min-height:112px;border:1px dashed transparent;border-radius:var(--ui-radius-card)}
.widget-drop-slot.ready{border-color:var(--mac-selection);background:var(--mac-selection-soft)}
</style>
