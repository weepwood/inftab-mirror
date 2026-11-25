<script setup lang="ts">
import { computed,nextTick,ref,onMounted,onBeforeUnmount,watch } from 'vue'
import type { Preferences } from '../types'
import { Search, Clock, Maximize, Type } from '@lucide/vue'
import { navigateMenu } from '../components/menuNavigation'
const props=defineProps<{controlsOnly?:boolean;blocked?:boolean;preferences?:Pick<Preferences,'themeMode'|'showSearchBar'|'showClock'|'dockMagnification'|'showNames'>}>()
const emit=defineEmits<{run:[command:string];update:[patch:Partial<Preferences>]}>()
const quickControls=[['showSearchBar','网页搜索栏',Search],['showClock','菜单栏时钟',Clock],['dockMagnification','Dock 放大',Maximize],['showNames','桌面图标名称',Type]] as const
const modes=['light','dark','system'] as const
function toggle(key:typeof quickControls[number][0]){if(props.preferences)emit('update',{[key]:!props.preferences[key]})}
const root=ref<HTMLElement>(),active=ref('')
const offset=ref(0)
const groups=computed(()=>props.controlsOnly?[{label:'控制中心',items:[['panel:settings','系统设置']]}]:[
 {label:'文件',items:[['desktop:finder','打开 Finder'],['add','新建快捷入口'],['desktop:folder','新建文件夹']]},
 {label:'显示',items:[['desktop:overview','窗口概览'],['layout','首页布局与小组件'],['light','浅色外观'],['dark','深色外观'],['system','跟随系统'],['desktop:classic','返回经典模式']]},
 {label:'设置',items:[['panel:settings','系统设置'],['find','查找快捷入口']]},
])
function close(restore=false){
 const previous=active.value
 active.value='';offset.value=0
 if(restore)root.value?.querySelector<HTMLButtonElement>('[data-menu="'+previous+'"]')?.focus()
}
function focusItem(last=false){
 void nextTick(()=>{
  const items=root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')
  if(props.controlsOnly){const panel=root.value?.querySelector<HTMLElement>('.desktop-dropdown');if(panel){const r=panel.getBoundingClientRect();offset.value+=Math.max(0,8-r.left)-Math.max(0,r.right-innerWidth+8)}}
  if(items?.length)items[last?items.length-1:0]?.focus({preventScroll:true})
 })
}
function open(label:string){
 if(props.blocked)return
 if(active.value===label){close(true);return}
 active.value=label;focusItem()
}
function keys(event:KeyboardEvent){
 if(event.key==='Escape'&&active.value){event.preventDefault();event.stopPropagation();close(true)}
 else if(['ArrowDown','ArrowUp'].includes(event.key)&&event.target instanceof HTMLButtonElement&&event.target.dataset.menu){
  event.preventDefault();event.stopPropagation();active.value=event.target.dataset.menu
  focusItem(event.key==='ArrowUp')
 }else if(active.value&&['ArrowLeft','ArrowRight'].includes(event.key)){
  event.preventDefault();event.stopPropagation()
  const index=groups.value.findIndex(g=>g.label===active.value)
  active.value=groups.value[(index+(event.key==='ArrowRight'?1:-1)+groups.value.length)%groups.value.length]!.label
  focusItem()
 }
}
function focusOut(event:FocusEvent){
 if(event.relatedTarget instanceof Node&&!root.value?.contains(event.relatedTarget))close()
}
function outside(event:PointerEvent){if(!root.value?.contains(event.target as Node))close()}
function run(command:string){close(true);emit('run',command)}
watch(()=>props.blocked,value=>{if(value)close()})
onMounted(()=>document.addEventListener('pointerdown',outside,true))
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside,true))
</script>
<template>
 <nav ref="root" class="desktop-menus" :class="{'control-center':controlsOnly}" :aria-label="controlsOnly?'桌面控制中心':'桌面功能菜单'" @keydown="keys" @focusout="focusOut">
  <div v-for="group in groups" :key="group.label" class="desktop-menu-anchor">
   <button type="button" :aria-label="group.label" :data-menu="group.label" aria-haspopup="menu" :aria-expanded="active===group.label" @click="open(group.label)" @pointerenter="active&&active!==group.label&&(active=group.label)"><svg v-if="controlsOnly" aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="6" rx="3"/><circle cx="6" cy="6" r="1.7" fill="currentColor" stroke="none"/><rect x="2" y="11" width="16" height="6" rx="3"/><circle cx="14" cy="14" r="1.7" fill="currentColor" stroke="none"/></svg><template v-else>{{group.label}}</template></button>
   <div v-if="active===group.label" class="desktop-dropdown" :style="controlsOnly?{translate:offset+'px 0'}:undefined" role="menu" :aria-label="group.label+'菜单'" @keydown="navigateMenu">
    <template v-if="controlsOnly&&preferences">
     <div class="control-heading" role="presentation">外观</div>
     <div class="control-segment" role="group" aria-label="外观模式"><button v-for="mode in modes" :key="mode" type="button" role="menuitemradio" :aria-checked="preferences.themeMode===mode" @click="emit('update',{themeMode:mode})">{{mode==='light'?'浅色':mode==='dark'?'深色':'自动'}}</button></div>
     <div class="control-heading" role="presentation">桌面显示</div>
     <div class="control-tiles"><button v-for="[key,label,Icon] in quickControls" :key="key" class="control-tile" type="button" role="menuitemcheckbox" :aria-label="label" :aria-checked="preferences[key]" @click="toggle(key)"><span class="control-tile-icon" aria-hidden="true"><component :is="Icon" :size="16" :stroke-width="2.25"/></span><span class="control-tile-text"><strong>{{label}}</strong><small>{{preferences[key]?'开启':'关闭'}}</small></span></button></div>
     <div class="control-separator" role="separator"/>
    </template>
    <button v-for="[id,label] in group.items" :key="id" type="button" role="menuitem" @click="run(id!)">{{label}}</button>
   </div>
  </div>
 </nav>
</template>
<style scoped>
.desktop-menus{display:flex;align-items:center;gap:2px;font:400 13px var(--mac-font);color:var(--mac-ink)}
.desktop-menu-anchor{position:relative}
button{border:0;background:transparent;color:inherit;cursor:pointer;border-radius:5px;padding:4px 8px;white-space:nowrap}
button:hover,button[aria-expanded=true]{background:var(--mac-selection-soft)}
.desktop-dropdown{position:absolute;top:calc(100% + 3px);left:0;z-index:2;min-width:200px;padding:var(--mac-menu-padding);background:var(--mac-glass-sheen) var(--mac-menu);border:1px solid var(--mac-glass-edge);border-radius:var(--mac-radius-menu);box-shadow:var(--mac-glass-shadow);-webkit-backdrop-filter:var(--mac-glass-filter);backdrop-filter:var(--mac-glass-filter)}
.desktop-dropdown button{display:block;text-align:left;width:100%;padding:6px 10px}
.desktop-dropdown button:hover,.desktop-dropdown button:focus-visible{background:var(--mac-selection);color:var(--mac-selection-ink);outline:0}
@media(max-width:800px){.desktop-menus:not(.control-center){display:none}}
.control-center .desktop-menu-anchor>button{width:27px;height:25px;padding:3px;display:grid;place-items:center;border-radius:8px}
.control-center .desktop-dropdown{left:auto;right:0;width:min(324px,calc(100vw - 16px));min-width:0;padding:10px;box-sizing:border-box}
.control-heading{font-size:11px;font-weight:600;color:var(--mac-muted);padding:6px 8px}
.control-segment{display:flex;gap:3px;padding:3px;background:var(--mac-glass-control);border-radius:12px}
.control-segment button{flex:1;text-align:center;padding:7px 4px;border-radius:9px}
.control-center .desktop-dropdown button[aria-checked=true][role=menuitemradio]{background:var(--mac-selection);color:var(--mac-selection-ink)}
/* ToggleTile layout port: a2d2-dev/macos27-claude, MIT.
   Omit nested blur, since the panel already provides a glass backdrop. */
.control-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.control-center .desktop-dropdown .control-tile{display:flex;align-items:center;gap:10px;height:60px;min-width:0;padding:8px 10px;text-align:left;border-radius:18px;background:rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.32);border:1px solid var(--mac-glass-edge)}
.control-center .desktop-dropdown .control-tile[aria-checked=true]{background:rgba(255,255,255,.28)}
.control-center .desktop-dropdown .control-tile:hover,.control-center .desktop-dropdown .control-tile:focus-visible{background:var(--mac-selection-soft);color:var(--mac-ink);outline:1px solid var(--ui-focus)}
.control-tile-icon{width:32px;height:32px;display:grid;place-items:center;flex:none;border-radius:50%;background:var(--mac-line);color:var(--mac-muted)}
[aria-checked=true]>.control-tile-icon{background:#0a84ff;color:white}
.control-tile-text{min-width:0;display:grid;gap:3px}
.control-tile-text strong,.control-tile-text small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.control-tile-text strong{font-size:13px;font-weight:500;line-height:16px}
.control-tile-text small{font-size:11px;color:var(--mac-muted);line-height:14px}
.control-separator{height:1px;background:var(--mac-line);margin:8px}
@media(max-width:340px){.control-tiles{grid-template-columns:1fr}}
@media(forced-colors:active){.control-tile-icon{border:1px solid ButtonText}[aria-checked=true]>.control-tile-icon{background:Highlight;color:HighlightText}}
</style>
