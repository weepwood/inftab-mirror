<script setup lang="ts">
import { nextTick,ref,onMounted,onBeforeUnmount } from 'vue'
import { navigateMenu } from '../components/menuNavigation'
const emit=defineEmits<{run:[command:string]}>()
const root=ref<HTMLElement>(),active=ref('')
const groups=[
 {label:'文件',items:[['desktop:finder','打开 Finder'],['add','新建快捷入口'],['desktop:folder','新建文件夹']]},
 {label:'显示',items:[['desktop:overview','窗口概览'],['layout','首页布局与小组件'],['light','浅色外观'],['dark','深色外观'],['system','跟随系统'],['desktop:classic','返回经典模式']]},
 {label:'设置',items:[['panel:settings','系统设置'],['find','查找快捷入口']]},
]
function close(restore=false){
 const previous=active.value
 active.value=''
 if(restore)root.value?.querySelector<HTMLButtonElement>('[data-menu="'+previous+'"]')?.focus()
}
function focusItem(last=false){
 void nextTick(()=>{
  const items=root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  if(items?.length)items[last?items.length-1:0]?.focus({preventScroll:true})
 })
}
function open(label:string){
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
  const index=groups.findIndex(g=>g.label===active.value)
  active.value=groups[(index+(event.key==='ArrowRight'?1:-1)+groups.length)%groups.length]!.label
  focusItem()
 }
}
function focusOut(event:FocusEvent){
 if(event.relatedTarget instanceof Node&&!root.value?.contains(event.relatedTarget))close()
}
function outside(event:PointerEvent){if(!root.value?.contains(event.target as Node))close()}
function run(command:string){close(true);emit('run',command)}
onMounted(()=>document.addEventListener('pointerdown',outside,true))
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside,true))
</script>
<template>
 <nav ref="root" class="desktop-menus" aria-label="桌面功能菜单" @keydown="keys" @focusout="focusOut">
  <div v-for="group in groups" :key="group.label" class="desktop-menu-anchor">
   <button type="button" :data-menu="group.label" aria-haspopup="menu" :aria-expanded="active===group.label" @click="open(group.label)" @pointerenter="active&&active!==group.label&&(active=group.label)">{{group.label}}</button>
   <div v-if="active===group.label" class="desktop-dropdown" role="menu" :aria-label="group.label+'菜单'" @keydown="navigateMenu">
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
.desktop-dropdown{position:absolute;top:calc(100% + 3px);left:0;z-index:2;min-width:200px;padding:var(--mac-menu-padding);background:var(--mac-menu);border:1px solid var(--mac-line);border-radius:var(--mac-radius-menu);box-shadow:var(--mac-shadow);backdrop-filter:blur(28px) saturate(165%)}
.desktop-dropdown button{display:block;text-align:left;width:100%;padding:6px 10px}
.desktop-dropdown button:hover,.desktop-dropdown button:focus-visible{background:var(--mac-selection);color:var(--mac-selection-ink);outline:0}
@media(max-width:800px){.desktop-menus{display:none}}
</style>
