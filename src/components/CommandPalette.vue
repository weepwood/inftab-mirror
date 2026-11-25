<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { trapOverlayTab, isComposingKey } from '../composables/overlayFocus'
import { filterCommands } from '../data/commands'

const props = defineProps<{ desktop?: boolean }>()
const emit = defineEmits<{ close: []; run: [id: string] }>()
const query = ref('')
const selected = ref(0)
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const commands = computed(() => filterCommands(query.value, props.desktop))
let returnFocus: HTMLElement | undefined

watch(query, () => { selected.value = 0 })
function move(direction: number) {
  const count = commands.value.length
  if (!count) return
  selected.value = (selected.value + direction + count) % count
  void nextTick(() => dialog.value?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }))
}
function run() {
  const command = commands.value[selected.value]
  if (command) emit('run', command.id)
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
        <input ref="input" v-model="query" type="search" role="combobox" aria-label="搜索命令" aria-expanded="true" aria-controls="command-results" :aria-activedescendant="commands.length ? 'command-' + selected : undefined" autocomplete="off" placeholder="输入命令…" @keydown="handleInputKey" />
        <button type="button" aria-label="关闭命令面板" @click="emit('close')">Esc</button>
      </header>
      <div id="command-results" role="listbox" aria-label="可用命令" class="command-results">
        <div v-for="(command, index) in commands" :id="'command-' + index" :key="command.id" role="option" :aria-selected="index === selected" class="command-option" @pointermove="($event.pointerType === 'mouse' || $event.pointerType === 'pen') && (selected = index)" @click="emit('run', command.id)"><span>{{ command.label }}</span><small>{{ command.detail }}</small></div>
        <p v-if="!commands.length" role="status">未找到匹配的命令。</p>
      </div>
      <footer><span>↑ ↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></footer>
    </div>
  </dialog>
</template>
