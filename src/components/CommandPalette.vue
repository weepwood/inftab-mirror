<script setup lang="ts">
import { Search, Folder, Grid2X2, ArrowUpRight, StickyNote, ListTodo, Command, X } from '@lucide/vue'
import { desktopHabitIcon, launcherIcons } from './launcherIcons'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { trapOverlayTab, isComposingKey } from '../composables/overlayFocus'
import { filterCommands } from '../data/commands'
import { searchDesktopRecords, readRecentCommands, rememberCommand } from '../desktop/spotlight'
import type { LauncherItem, Note, TodoItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'

const props = defineProps<{ desktop?: boolean; items?:LauncherItem[]; workspaces?:HomeWorkspace[]; notes?:Note[]; todos?:TodoItem[] }>()
const emit = defineEmits<{ close: []; run: [id: string] }>()
const query = ref('')
const selected = ref(0),browse=ref(false)
const expanded=computed(()=>!props.desktop||!!query.value.trim()||browse.value)
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const recent=ref<string[]>([])
try{if(props.desktop)recent.value=readRecentCommands(sessionStorage)}catch{/* storage denied */}
const data=computed(()=>({items:props.items??[],workspaces:props.workspaces??[],notes:props.notes??[],todos:props.todos??[]}))
const commands = computed(() => {
 const base=filterCommands(query.value, props.desktop)
 if(!props.desktop)return base
 if(query.value.trim()){
  const results=[...base,...searchDesktopRecords(query.value,data.value)]
  const phrase=query.value.normalize('NFKC').trim().toLocaleLowerCase()
  // Keep top match first; keep remaining categories contiguous.
  results.sort((a,b)=>Number(b.label.normalize('NFKC').toLocaleLowerCase()===phrase)-Number(a.label.normalize('NFKC').toLocaleLowerCase()===phrase))
  const first=results.shift()
  const groups=new Map<string,typeof results>()
  for(const r of results){const key=category(r.id,r.detail);const group=groups.get(key)??[];group.push(r);groups.set(key,group)}
  return first?[first,...[...groups.values()].flat()]:[]
 }
 // Show recent action commands only, not private record titles on empty search.
 const byId=new Map(base.map(command=>[String(command.id),command]))
 const ordered=recent.value.flatMap(id=>{const command=byId.get(id);return command?[command]:[]})
 const used=new Set(ordered.map(c=>c.id))
 return [...ordered,...base.filter(c=>!used.has(c.id))]
})
function category(id:string,detail:string){
 if(id.startsWith('panel:'))return '应用'
 if(id.startsWith('record:'))return detail.includes('待办')?'待办事项':detail
 return '操作与命令'
}
function groupHeading(index:number){
 const item=commands.value[index],previous=commands.value[index-1]
 if(!props.desktop||!item)return ''
 if(index===0)return query.value.trim()?'最匹配 · '+category(item.id,item.detail):'最近与建议'
 if(!query.value.trim())return ''
 if(index===1)return category(item.id,item.detail)
 const label=category(item.id,item.detail)
 return !previous||category(previous.id,previous.detail)!==label?label:''
}
function resultIcon(id:string,detail:string){
 const key=id.startsWith('panel:')?id.slice(6):''
 return (key==='habits'?desktopHabitIcon:launcherIcons[key])??(detail==='文件夹'||id==='desktop:finder'?Folder:detail==='笔记'?StickyNote:detail.includes('待办')?ListTodo:detail==='工作区'||id==='desktop:overview'?Grid2X2:detail==='快捷入口'?ArrowUpRight:Command)
}
watch(commands, items => { selected.value = Math.max(0,Math.min(selected.value,items.length-1)) })
let returnFocus: HTMLElement | undefined

watch(query, () => { selected.value = 0; browse.value=false; void nextTick(()=>{const list=dialog.value?.querySelector('.command-results');if(list)list.scrollTop=0}) })
const current=computed(()=>commands.value[selected.value])
const preview=computed(()=>{
 const r=current.value
 if(!r)return ''
 const id=r.id
 if(id.startsWith('record:note:'))return data.value.notes.find(n=>n.id===id.slice(12))?.body.slice(0,1800)||'空白笔记'
 if(id.startsWith('record:item:')){
  const item=data.value.items.find(i=>i.id===id.slice(12))
  return item?.shortcut?.url??(item?.folder?item.folder.shortcutIds.length+' 个快捷入口':'')
 }
 if(id.startsWith('record:todo:'))return data.value.todos.find(t=>t.id===id.slice(12))?.done?'已完成':'尚未完成'
 if(id.startsWith('record:workspace:'))return (data.value.workspaces.find(w=>w.id===id.slice(17))?.itemIds.length??0)+' 个桌面入口'
 return r.detail
})
function selectResult(index:number){selected.value=index;if(matchMedia('(max-width:560px)').matches){run();return}input.value?.focus({preventScroll:true})}
function openDouble(id:string){if(props.desktop&&!matchMedia('(max-width:560px)').matches)runCommand(id)}
function clearSearch(){query.value='';browse.value=false;input.value?.focus()}

function move(direction: number) {
  if(props.desktop&&!expanded.value){browse.value=true;selected.value=0;return}
  const count = commands.value.length
  if (!count) return
  selected.value = (selected.value + direction + count) % count
  void nextTick(() => dialog.value?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }))
}
function runCommand(id:string){
 if(props.desktop&&!id.startsWith('record:'))try{rememberCommand(id,sessionStorage)}catch{/* storage denied */}
 emit('run',id)
}
function run() {
  if(props.desktop&&!expanded.value)return
  const command = commands.value[selected.value]
  if (command) runCommand(command.id)
}
function handleInputKey(event: KeyboardEvent) {
  if (isComposingKey(event)) { event.stopPropagation(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
  else if (event.key === 'Enter') { event.preventDefault(); run() }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close') }
}
function handleDialogKey(event: KeyboardEvent) { trapOverlayTab(event, dialog.value) }
onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
  input.value?.focus()
})
onBeforeUnmount(() => {
  dialog.value?.close?.()
  if (returnFocus?.isConnected) returnFocus.focus()
})
</script>

<template>
  <dialog ref="dialog" class="command-palette" :class="{'spotlight-classic':desktop,'spotlight-expanded':desktop&&expanded}" aria-label="命令面板" @keydown="handleDialogKey" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="command-shell">
      <header>
        <Search v-if="desktop" class="spotlight-search-icon" :size="23" aria-hidden="true"/>
        <input ref="input" v-model="query" type="search" role="combobox" aria-label="搜索命令" :aria-expanded="expanded" aria-controls="command-results" :aria-activedescendant="expanded&&commands.length ? 'command-' + selected : undefined" autocomplete="off" :placeholder="desktop?'Spotlight 搜索':'输入命令…'" @keydown="handleInputKey" />
        <button v-if="desktop&&query" class="spotlight-clear" type="button" aria-label="清除搜索" @click="clearSearch"><X :size="15"/></button>
        <button v-else-if="desktop" class="spotlight-expand" type="button" :aria-label="expanded?'收起建议':'显示建议'" @click="browse=!browse;input?.focus()"><span aria-hidden="true">⌄</span></button>
        <button v-else type="button" aria-label="关闭命令面板" @click="emit('close')">Esc</button>
      </header>
      <div v-show="expanded" class="spotlight-body"><div id="command-results" role="listbox" aria-label="可用命令" class="command-results">
        <template v-for="(command, index) in commands" :key="command.id"><div v-if="groupHeading(index)" class="spotlight-group-heading" role="presentation" aria-hidden="true">{{groupHeading(index)}}</div><div :id="'command-' + index" role="option" :aria-selected="index === selected" class="command-option" @pointermove="!desktop&&($event.pointerType === 'mouse' || $event.pointerType === 'pen') && (selected = index)" @click="desktop?selectResult(index):runCommand(command.id)" @dblclick="openDouble(command.id)"><span :class="{'spotlight-label':desktop}"><span v-if="desktop" class="spotlight-icon" :class="{builtin:command.id.startsWith('panel:')}" :data-action="command.id.startsWith('panel:')?command.id.slice(6):undefined" aria-hidden="true"><component :is="resultIcon(command.id,command.detail)" :size="16" :stroke-width="1.8"/></span><span>{{ command.label }}</span></span><small>{{ command.detail }}</small></div></template>
        <p v-if="!commands.length" role="status">{{desktop?'未找到匹配的结果':'未找到匹配的命令。'}}</p>
      </div>
      <aside v-if="desktop&&current" class="spotlight-preview" aria-label="所选结果预览">
        <span class="spotlight-icon preview-icon" :class="{builtin:current.id.startsWith('panel:')}" :data-action="current.id.startsWith('panel:')?current.id.slice(6):undefined" aria-hidden="true"><component :is="resultIcon(current.id,current.detail)" :size="38" :stroke-width="1.5"/></span>
        <strong>{{current.label}}</strong><small>{{current.detail}}</small>
        <p>{{preview}}</p>
        <button type="button" @click="run()">打开 <kbd>↵</kbd></button>
      </aside></div>
      <footer v-if="!desktop||expanded"><span>↑ ↓ 选择</span><span>Enter {{desktop?'打开':'执行'}}</span><span>Esc 关闭</span><span v-if="desktop" class="spotlight-count">{{commands.length}} 个结果</span></footer>
    </div>
  </dialog>
</template>
