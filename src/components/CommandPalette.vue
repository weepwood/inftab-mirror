<script setup lang="ts">
import { Search, Folder, Grid2X2, ArrowUpRight, StickyNote, ListTodo, Command } from '@lucide/vue'
import { launcherIcons } from './launcherIcons'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { trapOverlayTab, isComposingKey } from '../composables/overlayFocus'
import { filterCommands } from '../data/commands'
import { searchDesktopRecords, readRecentCommands, rememberCommand } from '../desktop/spotlight'
import type { LauncherItem, Note, TodoItem } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'

const props = defineProps<{ desktop?: boolean; items?:LauncherItem[]; workspaces?:HomeWorkspace[]; notes?:Note[]; todos?:TodoItem[] }>()
const emit = defineEmits<{ close: []; run: [id: string] }>()
const query = ref('')
const selected = ref(0)
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const recent=ref<string[]>([])
try{if(props.desktop)recent.value=readRecentCommands(sessionStorage)}catch{/* storage denied */}
const data=computed(()=>({items:props.items??[],workspaces:props.workspaces??[],notes:props.notes??[],todos:props.todos??[]}))
const commands = computed(() => {
 const base=filterCommands(query.value, props.desktop)
 if(!props.desktop)return base
 if(query.value.trim())return [...base,...searchDesktopRecords(query.value,data.value)]
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
 if(!props.desktop||!item||!query.value.trim())return ''
 const label=category(item.id,item.detail)
 return !previous||category(previous.id,previous.detail)!==label?label:''
}
function resultIcon(id:string,detail:string){
 const key=id.startsWith('panel:')?id.slice(6):''
 return launcherIcons[key]??(detail==='文件夹'||id==='desktop:finder'?Folder:detail==='笔记'?StickyNote:detail.includes('待办')?ListTodo:detail==='工作区'||id==='desktop:overview'?Grid2X2:detail==='快捷入口'?ArrowUpRight:Command)
}
watch(commands, items => { selected.value = Math.max(0,Math.min(selected.value,items.length-1)) })
let returnFocus: HTMLElement | undefined

watch(query, () => { selected.value = 0 })
function move(direction: number) {
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
  <dialog ref="dialog" class="command-palette" aria-label="命令面板" @keydown="handleDialogKey" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="command-shell">
      <header>
        <Search v-if="desktop" class="spotlight-search-icon" :size="23" aria-hidden="true"/>
        <input ref="input" v-model="query" type="search" role="combobox" aria-label="搜索命令" aria-expanded="true" aria-controls="command-results" :aria-activedescendant="commands.length ? 'command-' + selected : undefined" autocomplete="off" :placeholder="desktop?'搜索应用、入口、笔记、待办…':'输入命令…'" @keydown="handleInputKey" />
        <button type="button" aria-label="关闭命令面板" @click="emit('close')">Esc</button>
      </header>
      <div id="command-results" role="listbox" aria-label="可用命令" class="command-results">
        <template v-for="(command, index) in commands" :key="command.id"><div v-if="groupHeading(index)" class="spotlight-group-heading" role="presentation" aria-hidden="true">{{groupHeading(index)}}</div><div :id="'command-' + index" role="option" :aria-selected="index === selected" class="command-option" @pointermove="($event.pointerType === 'mouse' || $event.pointerType === 'pen') && (selected = index)" @click="runCommand(command.id)"><span :class="{'spotlight-label':desktop}"><span v-if="desktop" class="spotlight-icon" :class="{builtin:command.id.startsWith('panel:')}" :data-action="command.id.startsWith('panel:')?command.id.slice(6):undefined" aria-hidden="true"><component :is="resultIcon(command.id,command.detail)" :size="16" :stroke-width="1.8"/></span><span>{{ command.label }}</span></span><small>{{ command.detail }}</small></div></template>
        <p v-if="!commands.length" role="status">未找到匹配的命令。</p>
      </div>
      <footer><span>↑ ↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></footer>
    </div>
  </dialog>
</template>
