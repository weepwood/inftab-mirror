<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import type { LauncherItem } from '../types'
import { navigateMenu } from '../components/menuNavigation'
import { desktopHabitIcon, launcherIcons } from '../components/launcherIcons'
import { folderParents } from '../data/folderTree'
import { cell, arrangeFromRight, resolvePoints, fitPoint, freshLayout, normalizeLayout, translateGroup, createOccupancy, type Point, type DesktopLayout } from './layout'
const props = defineProps<{items: LauncherItem[]; workspaceId: string; layout?: DesktopLayout; folderShortcuts?: LauncherItem[]; dark?: boolean; blocked?:boolean; searchActive?:boolean; showNames?:boolean}>()
const emit = defineEmits<{open: [item: LauncherItem, event?: MouseEvent]; edit: [item: LauncherItem]; layout: [layout: DesktopLayout]; finder:[]; create:[]; remove:[item:LauncherItem]; membership:[item:LauncherItem,folderId:string]; dismissSearch:[]}>()
const surface = ref<HTMLElement>()
const selected = ref<string[]>([])
const visibleItems=computed(()=>{const parents=folderParents(props.items.flatMap(i=>i.folder?[i.folder]:[]),{id:props.workspaceId,name:'',itemIds:props.items.map(i=>i.id)});return props.items.filter(i=>!parents.has(i.id))})
const menu = ref<{x:number;y:number;item?:LauncherItem}>()
const menuRoot=ref<HTMLElement>()
let menuTrigger:HTMLElement|undefined
const marquee=ref<{x:number;y:number;endX:number;endY:number}>()
let marqueePointer:number|undefined,marqueeOwner:HTMLElement|undefined
function boxStart(e:PointerEvent){
 if(props.blocked||press||e.button!==0||e.target!==e.currentTarget)return
 emit('dismissSearch');selected.value=[];closeMenu()
 // Touch scroll is not a mouse selection gesture.
 if(e.pointerType==='touch')return
 const el=surface.value;if(!el)return
 const r=el.getBoundingClientRect(),x=e.clientX-r.left+el.scrollLeft,y=e.clientY-r.top+el.scrollTop
 marquee.value={x,y,endX:x,endY:y};marqueePointer=e.pointerId;marqueeOwner=e.currentTarget as HTMLElement
 marqueeOwner.setPointerCapture(e.pointerId)
}
function boxMove(e:PointerEvent){if(!marquee.value||e.pointerId!==marqueePointer||!surface.value)return;const r=surface.value.getBoundingClientRect();const m=marquee.value;m.endX=e.clientX-r.left+surface.value.scrollLeft;m.endY=e.clientY-r.top+surface.value.scrollTop;selected.value=positions.value.filter(p=>p.point.x<Math.max(m.x,m.endX)&&p.point.x+cell>Math.min(m.x,m.endX)&&p.point.y<Math.max(m.y,m.endY)&&p.point.y+cell>Math.min(m.y,m.endY)).map(p=>p.item.id)}
function boxEnd(e?:PointerEvent){
 if(e&&e.pointerId!==marqueePointer)return
 const owner=marqueeOwner,pointer=marqueePointer
 marquee.value=undefined;marqueePointer=undefined;marqueeOwner=undefined
 if(owner&&pointer!==undefined&&owner.hasPointerCapture(pointer))owner.releasePointerCapture(pointer)
}
const failedIcons = ref<Record<string,string>>({})
// Parent keys this component by workspace ID; each space has an independent record.
const layout = computed(() => props.layout ?? freshLayout())
function update(next: DesktopLayout) { emit('layout', next) }
function arrangeRight(){
 if(dragging)return
 const positions=arrangeFromRight(visibleItems.value.map(i=>i.id),width.value,surface.value?.clientHeight??height.value)
 update({...layout.value,positions:{...layout.value.positions,...positions}})
}
function migrate() {
  if (props.layout) return
  try {
    const raw = localStorage.getItem('inftab.desktop.v1.' + encodeURIComponent(props.workspaceId))
    if (raw) update(normalizeLayout(JSON.parse(raw)))
  } catch { /* invalid legacy data is ignored */ }
}
const width = ref(960)
const height = ref(480)
const canvasHeight = computed(() => Math.max(height.value, Math.ceil(visibleItems.value.length / Math.max(1, Math.floor(width.value/cell)))*cell, ...visibleItems.value.map(item => (layout.value.positions[item.id]?.y ?? 0) + cell)))
const resolved = computed(() => resolvePoints(visibleItems.value.map(i=>i.id),layout.value.positions,width.value,canvasHeight.value))
const positions = computed(() => visibleItems.value.map(item => ({item,point:resolved.value[item.id]!})))
const renderedHeight = computed(() => Math.max(canvasHeight.value,...positions.value.map(p=>p.point.y+cell)))
let observer: ResizeObserver | undefined
type DragMember = { id:string; el:HTMLElement; point:Point }
let dragging: {id:string; x:number; y:number; dx:number; dy:number; members:DragMember[]; source:Record<string,Point>; overlaps:(p:Point)=>boolean} | undefined
const holdMs=180,touchHoldMs=450,moveThreshold=5
type Press={pointer:number;button:number;item:LauncherItem;el:HTMLElement;x:number;y:number;at:number;travelled:boolean;touch?:boolean;timer?:ReturnType<typeof setTimeout>}
let press:Press|undefined
let suppressClick=false
const moving=ref(false),touchArrange=ref(false)
function save(id: string, x: number, y: number) {
  const point = fitPoint({x,y},width.value,renderedHeight.value,layout.value.snap)
  const occupied = positions.value.some(p => p.item.id !== id && Math.abs(p.point.x-point.x)<cell && Math.abs(p.point.y-point.y)<cell)
  if (occupied) return
  const current=resolved.value[id]
  if(!current||current.x===point.x&&current.y===point.y)return
  commitPositions({[id]:point})
}
function selectedGroup(id:string) {
  return selected.value.includes(id) ? [id,...selected.value.filter(candidate=>candidate!==id&&resolved.value[candidate])] : [id]
}
function commitPositions(moved:Record<string,Point>){
  // Materialize the visible baseline before moving: unsaved defaults must
  // not fill the vacated cell and shift unrelated icons.
  const next={...layout.value.positions,...resolved.value,...moved}
  const candidate=resolvePoints(visibleItems.value.map(item=>item.id),next,width.value,renderedHeight.value)
  if(positions.value.some(({item,point})=>{
    const expected=moved[item.id]??point,actual=candidate[item.id]
    return !actual||actual.x!==expected.x||actual.y!==expected.y
  }))return
  update({...layout.value,positions:next})
}
function saveGroup(ids:string[],dx:number,dy:number) {
  const source=Object.fromEntries(ids.flatMap(id=>resolved.value[id]?[[id,resolved.value[id]!]]:[]))
  const moved=translateGroup(source,{x:dx,y:dy},width.value,renderedHeight.value,layout.value.snap)
  if(ids.some(id=>moved[id]&&(moved[id]!.x!==source[id]?.x||moved[id]!.y!==source[id]?.y)))commitPositions(moved)
}
function restoreDrag(members:DragMember[]) {
  for(const member of members){
    member.el.style.zIndex='';delete member.el.dataset.drop
    const point=resolved.value[member.id]
    if(point&&member.el.isConnected)member.el.style.transform='translate('+point.x+'px,'+point.y+'px)'
  }
}
function activate(item: LauncherItem, event: MouseEvent) {
  if(props.blocked)return
  if(event.detail!==0&&suppressClick){suppressClick=false;return}
  if(touchArrange.value&&event.detail!==0){selected.value=[item.id];return}
  if(event.ctrlKey||event.metaKey||event.shiftKey){
    selected.value=selected.value.includes(item.id)?selected.value.filter(id=>id!==item.id):[...selected.value,item.id]
    return
  }
  // A double click is one activation, not two browser tabs or requests.
  if(event.button===0&&event.detail>1)return
  selected.value=[item.id]
  closeMenu()
  emit('open',item,event)
}
function pointerStart(event:PointerEvent,item:LauncherItem){
  if(props.blocked||press||marquee.value||![0,2].includes(event.button))return
  closeMenu()
  const el=event.currentTarget as HTMLElement
  suppressClick=false
  press={pointer:event.pointerId,button:event.button,item,el,x:event.clientX,y:event.clientY,at:performance.now(),travelled:false,touch:event.pointerType==='touch'}
  const p=press
  if(p.touch&&!touchArrange.value)p.timer=setTimeout(()=>{
    if(press!==p||p.travelled||props.blocked)return
    suppressClick=true;selected.value=[item.id];emit('dismissSearch')
    openMenu(p.x,p.y,item,el,false)
  },touchHoldMs)
  if(event.button===2){
    event.preventDefault();event.stopPropagation();emit('dismissSearch')
    el.focus({preventScroll:true})
    if(!selected.value.includes(item.id))selected.value=[item.id]
  }
  try{el.setPointerCapture(event.pointerId)}catch{/* pointer already cancelled */}
}
function pointerMove(event:PointerEvent){
  const p=press
  if(!p||p.pointer!==event.pointerId)return
  const dx=event.clientX-p.x,dy=event.clientY-p.y
  if(Math.hypot(dx,dy)>=moveThreshold)p.travelled=true
  const freeDrag=p.button===0&&(p.touch?touchArrange.value:!layout.value.snap)
  if(p.button===0){if(p.travelled){suppressClick=true;clearTimeout(p.timer);if(p.touch&&!touchArrange.value)closeMenu()}if(!freeDrag)return}
  if(!(event.buttons&(freeDrag?1:2))){cancelDrag();return}
  if(!dragging){
    if(!p.travelled||(!freeDrag&&performance.now()-p.at<holdMs))return
    if(freeDrag){emit('dismissSearch');if(!selected.value.includes(p.item.id))selected.value=[p.item.id]}
    const point=resolved.value[p.item.id]
    if(!point)return cancelDrag()
    const members=selectedGroup(p.item.id).flatMap(id=>{
      const el=id===p.item.id?p.el:surface.value?.querySelector<HTMLElement>('[data-item-id="'+CSS.escape(id)+'"]')
      const point=resolved.value[id]
      return el&&point?[{id,el,point}]:[]
    })
    if(!members.length)return cancelDrag()
    const source=Object.fromEntries(members.map(m=>[m.id,m.point]))
    const {overlaps}=createOccupancy(positions.value.filter(q=>!Object.hasOwn(source,q.item.id)).map(q=>q.point))
    dragging={id:p.item.id,x:point.x,y:point.y,dx:0,dy:0,members,source,overlaps}
    moving.value=true
    for(const member of members)member.el.style.zIndex='2'
  }
  const d=dragging,point=d.members[0]!.point
  d.x=point.x+dx;d.y=point.y+dy;d.dx=dx;d.dy=dy
  const target=(snap=false)=>d.members.length===1?{[d.id]:fitPoint(d,width.value,renderedHeight.value,snap)}:translateGroup(d.source,{x:dx,y:dy},width.value,renderedHeight.value,snap)
  const preview=target()
  const feedback=p.button===0||d.members.length>1
  const blocked=feedback&&Object.values(layout.value.snap?target(true):preview).some(d.overlaps)
  for(const member of d.members){
    const pos=preview[member.id];if(!pos)continue
    member.el.style.transform='translate('+pos.x+'px,'+pos.y+'px)'
    if(feedback)member.el.dataset.drop=blocked?'blocked':'ready'
  }
}
function releasePress(p:Press){
  clearTimeout(p.timer);press=undefined
  try{if(p.el.hasPointerCapture(p.pointer))p.el.releasePointerCapture(p.pointer)}catch{/* detached */}
}
function pointerEnd(event:PointerEvent){
  const p=press
  if(!p||p.pointer!==event.pointerId)return
  const d=dragging
  dragging=undefined;moving.value=false
  releasePress(p)
  if(p.button===0&&!d){
    if(p.touch&&!touchArrange.value&&!p.travelled&&performance.now()-p.at>=touchHoldMs){
      suppressClick=true;event.preventDefault();event.stopPropagation()
      if(!menu.value)openMenu(p.x,p.y,p.item,p.el,false)
    }
    return
  }
  event.preventDefault();event.stopPropagation()
  if(!d){
    if(!p.travelled)openMenu(event.clientX,event.clientY,p.item,p.el)
    return
  }
  if(d.members.length>1)saveGroup(d.members.map(m=>m.id),d.dx,d.dy)
  else{
    const source=visibleItems.value.find(i=>i.id===d.id)
    const target=positions.value.find(q=>q.item.id!==d.id&&q.item.folder&&Math.abs(q.point.x-d.x)<40&&Math.abs(q.point.y-d.y)<40)
    if(source?.shortcut&&target&&p.button===2)emit('membership',source,target.item.id)
    else save(d.id,d.x,d.y)
  }
  void nextTick(()=>{if(!dragging)restoreDrag(d.members)})
}
function pointerCancel(event:PointerEvent){if(press?.pointer===event.pointerId)cancelDrag()}
function keyMove(event: KeyboardEvent,id: string) {
  if(props.blocked||press)return
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selected.value=visibleItems.value.map(i=>i.id);return}
  if(event.key===' '){event.preventDefault();selected.value=selected.value.includes(id)?selected.value.filter(i=>i!==id):[...selected.value,id];return}
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();event.stopPropagation();const el=event.currentTarget as HTMLElement,r=el.getBoundingClientRect();openMenu(r.left,r.bottom,visibleItems.value.find(i=>i.id===id),el);return}
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
  const dx=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0
  const dy=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0
  const ids=selectedGroup(id)
  if(ids.length>1)saveGroup(ids,dx,dy)
  else save(id,point.x+dx,point.y+dy)
}
onMounted(() => {
  migrate()
  const root = surface.value
  if (!root) return
  const measure = () => { const w=root.clientWidth || 960, h=root.clientHeight || 480; if(w!==width.value || h!==height.value) blur(); width.value=w; height.value=h }
  measure()
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(root) }
})
function cancelDrag() {
  const p=press,d=dragging
  dragging=undefined;moving.value=false
  if(p){if(p.button===0)suppressClick=true;releasePress(p)}
  if(d)restoreDrag(d.members)
}
function closeMenu(restore=false){
  if(!menu.value)return
  const trigger=menuTrigger
  menu.value=undefined;menuTrigger=undefined
  if(restore&&trigger?.isConnected)trigger.focus({preventScroll:true})
}
function cancelKey(event:KeyboardEvent){
  if(event.key!=='Escape'||(!press&&!menu.value&&!marquee.value))return
  event.preventDefault();event.stopImmediatePropagation()
  cancelDrag();boxEnd();closeMenu(true)
}
function openMenu(x:number,y:number,item?:LauncherItem,trigger?:HTMLElement,focus=true){
  if(props.blocked)return
  menuTrigger=trigger
  menu.value={x,y,item}
  void nextTick(()=>{
    const root=menuRoot.value
    if(!root||!menu.value)return
    const r=root.getBoundingClientRect()
    menu.value.x=Math.max(4,Math.min(menu.value.x,innerWidth-r.width-4))
    menu.value.y=Math.max(4,Math.min(menu.value.y,innerHeight-r.height-4))
    if(focus)root.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})
  })
}
function context(event:MouseEvent){openMenu(event.clientX,event.clientY,undefined,surface.value)}
function menuAction(action:()=>void){closeMenu(true);action()}
function openMenuItem(){const item=menu.value?.item;menuAction(()=>{if(item)emit('open',item)})}
function editMenuItem(remove=false){const item=menu.value?.item;menuAction(()=>{if(item){if(remove)emit('remove',item);else emit('edit',item)}})}

function outside(event:PointerEvent){
  if(menu.value&&!menuRoot.value?.contains(event.target as Node))closeMenu()
  if(press&&event.pointerId!==press.pointer)cancelDrag()
  if(marquee.value&&event.pointerId!==marqueePointer)boxEnd()
}
function blur(){cancelDrag();boxEnd();closeMenu()}
function ancestorScroll(e:Event){if(e.target instanceof Element&&surface.value&&e.target.contains(surface.value))blur()}
watch(()=>props.blocked,blocked=>{if(blocked)blur()})
watch(()=>props.searchActive,active=>{if(active)blur()})
onMounted(()=>{
 window.addEventListener('blur',blur)
 window.addEventListener('keydown',cancelKey,true)
 document.addEventListener('pointerdown',outside,true)
 document.addEventListener('scroll',ancestorScroll,true)
})
onBeforeUnmount(()=>{
 blur();observer?.disconnect()
 window.removeEventListener('blur',blur)
 window.removeEventListener('keydown',cancelKey,true)
 document.removeEventListener('pointerdown',outside,true)
 document.removeEventListener('scroll',ancestorScroll,true)
})
watch(() => visibleItems.value.map(i=>i.id), ids => {
  if ((press&&!ids.includes(press.item.id))||(dragging&&dragging.members.some(member=>!ids.includes(member.id))))cancelDrag()
  selected.value=selected.value.filter(id=>ids.includes(id))
})
</script>
<template>
  <section class="desktop-shell" :class="{'is-moving':moving,'hide-names':showNames===false,'touch-arrange':touchArrange}" aria-label="自由桌面">
    <div class="desktop-toolbar" @pointerdown="emit('dismissSearch')">
      <span>{{selected.length?selected.length+' 项已选':layout.snap?'桌面':'自由排布'}}</span>
      <button type="button" @click="emit('finder')">Finder</button>
      <button type="button" :aria-pressed="layout.snap" :title="layout.snap?'关闭吸附，启用左键自由拖动':'启用网格吸附'" @click="blur();update({...layout,snap:!layout.snap})">网格吸附</button>
      <button type="button" @click="update({...layout,positions:{}})">整理图标</button>
      <button v-if="touchArrange" type="button" @click="blur();touchArrange=false">完成排布</button>
    </div>
    <div ref="surface" tabindex="-1" class="desktop-surface" @click.self="selected=[];closeMenu()" @scroll.passive="cancelDrag();boxEnd();closeMenu()" @contextmenu.self.prevent="context($event)">
      <div class="desktop-canvas" @pointerdown="boxStart" @pointermove="boxMove" @pointerup="boxEnd" @pointercancel="boxEnd" @lostpointercapture="boxEnd" @contextmenu.self.prevent="context($event)" :style="{height: renderedHeight+'px'}">
        <button v-for="{item,point} in positions" :key="item.id" type="button" class="desktop-icon" :class="{selected:selected.includes(item.id)}" :data-item-id="item.id" :style="{transform:'translate('+point.x+'px,'+point.y+'px)'}" :aria-label="item.title" :aria-pressed="selected.includes(item.id)" @pointerdown="pointerStart($event,item)" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerCancel" @lostpointercapture="pointerCancel" @click="activate(item,$event)" @auxclick.middle.prevent="activate(item,$event)" @auxclick.right.prevent @contextmenu.stop.prevent @keydown="keyMove($event,item.id)">
          <span class="desktop-symbol" :class="{builtin:item.action}" :data-action="item.action" :style="{background:item.action ? undefined : item.color}">
            <span v-if="item.folder" class="mac-folder mac-folder-icon" aria-hidden="true"></span>
            <component v-else-if="item.action && launcherIcons[item.action]" :is="item.action==='habits'?desktopHabitIcon:launcherIcons[item.action]" :size="30" :stroke-width="1.8"/>
            <img v-else-if="item.icon && failedIcons[item.id]!==item.icon" :src="item.icon" alt="" draggable="false" @error="failedIcons[item.id]=item.icon!"/>
            <span v-else>{{item.mark}}</span>
          </span>
          <span v-if="showNames!==false" class="desktop-label">{{item.title}}</span>
        </button>
        <div v-if="marquee" class="desktop-marquee" :style="{left:Math.min(marquee.x,marquee.endX)+'px',top:Math.min(marquee.y,marquee.endY)+'px',width:Math.abs(marquee.endX-marquee.x)+'px',height:Math.abs(marquee.endY-marquee.y)+'px'}"/>
      </div>
    </div>
    <div v-if="menu" ref="menuRoot" class="desktop-menu" @keydown="navigateMenu" @focusout="!menuRoot?.contains($event.relatedTarget as Node)&&closeMenu()" :class="{dark}" :style="{left:menu.x+'px',top:menu.y+'px'}" role="menu">
      <button v-if="menu.item" role="menuitem" @click="openMenuItem">打开</button><button role="menuitem" @click="menuAction(()=>emit('create'))">新建文件夹</button>
      <button role="menuitem" @click="menuAction(()=>emit('finder'))">打开 Finder</button>
      <button role="menuitem" @click="menuAction(()=>update({...layout,positions:{}}))">整理图标</button><button role="menuitem" @click="menuAction(arrangeRight)">从右上排列</button><button role="menuitem" @click="menuAction(()=>{touchArrange=!touchArrange})">{{touchArrange?'完成排布':'触屏排布'}}</button>
      <template v-if="menu.item?.shortcut||menu.item?.folder"><button role="menuitem" @click="editMenuItem()">编辑</button><button role="menuitem" @click="editMenuItem(true)">删除</button></template>
    </div>
  </section>
</template>
<style scoped>
.desktop-shell{width:100%;min-width:0;color:#fff;flex:1;display:flex;flex-direction:column;min-height:0}
.desktop-toolbar{display:flex;align-items:center;gap:3px;align-self:flex-end;max-width:100%;padding:3px 4px;background:var(--mac-bar);color:var(--mac-ink);border:1px solid var(--mac-line);border-radius:var(--mac-radius-menu);backdrop-filter:blur(20px) saturate(135%);box-shadow:0 3px 12px #0002;margin-bottom:3px}
.desktop-toolbar span{min-width:0;overflow:hidden;text-overflow:ellipsis;margin:0 5px;font-size:11px;font-weight:500;white-space:nowrap;color:var(--mac-muted)}
.desktop-toolbar button{flex-shrink:0;white-space:nowrap;border:0;background:transparent;color:var(--mac-ink);border-radius:var(--mac-radius-menu-item);padding:5px 8px;font-size:12px;cursor:pointer}
.desktop-toolbar button:hover{background:var(--mac-selection-soft)}.desktop-toolbar button[aria-pressed=true]{background:var(--mac-selection-soft);color:var(--mac-ink)}.desktop-toolbar button:focus-visible{outline:2px solid var(--ui-focus);outline-offset:1px}
.desktop-surface{position:relative;flex:1;min-height:240px;overflow:auto}
.desktop-canvas{position:relative;min-width:100%;touch-action:pan-y}
.desktop-icon{position:absolute;top:0;left:0;width:96px;height:96px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:5px 0 0;gap:4px;border:0;background:none;color:white;touch-action:pan-y;user-select:none;-webkit-touch-callout:none;cursor:pointer}
.desktop-shell.is-moving,.desktop-shell.is-moving .desktop-icon{cursor:grabbing}
.touch-arrange .desktop-icon{touch-action:none;cursor:grab}.touch-arrange .desktop-toolbar{flex-wrap:wrap}.desktop-icon[data-drop=ready]{border-radius:8px;background:#559aff20}.desktop-icon[data-drop=blocked]{border-radius:8px;background:#d84c4c35;outline:1px solid #ffaaa7;outline-offset:-2px}
.desktop-icon:focus-visible{outline:2px solid white;outline-offset:-3px;border-radius:8px}
.desktop-shell{--desktop-symbol-size:clamp(32px,calc(var(--shortcut-size,72px) * .75 + 2px),56px)}.desktop-shell.hide-names{--desktop-symbol-size:clamp(32px,calc(var(--shortcut-size,72px) * .75 + 2px),80px)}
.desktop-shell.hide-names .desktop-icon{justify-content:center;padding:0}
.desktop-symbol{width:var(--desktop-symbol-size);height:var(--desktop-symbol-size);flex:none;border-radius:var(--mac-icon-radius);border:1px solid var(--mac-icon-edge);display:grid;place-items:center;overflow:hidden;color:white;box-shadow:var(--mac-icon-shadow);font-size:24px}

.desktop-symbol img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.desktop-label{max-width:90px;padding:1px 5px;border-radius:5px;box-sizing:border-box;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere;white-space:normal;font-size:12px;font-weight:500;line-height:14px;text-align:center;color:var(--mac-desktop-label-ink);background:var(--mac-desktop-label)}
.desktop-icon.selected .desktop-symbol{outline:2px solid #90c9ff;outline-offset:3px}.desktop-icon:focus-visible .desktop-symbol{outline:2px solid #fff;outline-offset:3px}.desktop-icon.selected .desktop-label{background:var(--mac-selection)}.desktop-symbol:has(.mac-folder){background:none!important;box-shadow:none;border:0;overflow:visible}.mac-folder{--folder-size:var(--desktop-symbol-size)}.desktop-menu{position:fixed;z-index:10;background:var(--mac-menu);color:var(--mac-ink);padding:var(--mac-menu-padding);border:1px solid var(--mac-line);border-radius:var(--mac-radius-menu);box-shadow:var(--mac-shadow);width:170px;max-width:calc(100vw - 8px);max-height:calc(100dvh - 8px);overflow:auto;overscroll-behavior:contain;backdrop-filter:blur(18px)}.desktop-menu button{display:block;width:100%;text-align:left;padding:7px 9px;background:none;border:0;border-radius:var(--mac-radius-menu-item);color:inherit;cursor:pointer}.desktop-menu button:hover,.desktop-menu button:focus-visible{background:var(--mac-selection);color:var(--mac-selection-ink)}
.desktop-marquee{position:absolute;pointer-events:none;border:1px solid #93c9ff;background:#559aff30;z-index:4}@media(prefers-reduced-motion:no-preference){.desktop-shell{animation:desktop-space-in .14s ease-out}@keyframes desktop-space-in{from{opacity:.65}to{opacity:1}}.desktop-icon.selected .desktop-symbol{transition:outline-color .12s}.finder{animation:finder-appear .15s ease-out}}
.desktop-menu.dark{background:var(--mac-menu);color:var(--mac-ink);border-color:var(--mac-line)}
@media(forced-colors:active){.desktop-label{color:CanvasText;background:Canvas}.desktop-icon.selected .desktop-label{color:HighlightText;background:Highlight}.desktop-icon:focus-visible{outline-color:Highlight}}
@media(pointer:coarse){.desktop-menu button{min-height:44px;padding:9px 12px}}
@media(max-width:480px){.desktop-toolbar{gap:3px}.desktop-toolbar span{font-size:10px;margin-inline:2px}.desktop-toolbar button{padding:5px;font-size:11px}}
</style>
