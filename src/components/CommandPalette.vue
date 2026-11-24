<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { filterCommands } from '../data/commands'

const emit = defineEmits<{ close: []; run: [id: string] }>()
const query = ref('')
const selected = ref(0)
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const commands = computed(() => filterCommands(query.value))
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
  <dialog ref="dialog" class="command-palette" aria-label="命令面板" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="command-shell">
      <header>
        <input ref="input" v-model="query" type="search" role="combobox" aria-label="搜索命令" aria-expanded="true" aria-controls="command-results" :aria-activedescendant="commands.length ? 'command-' + selected : undefined" autocomplete="off" placeholder="输入命令…" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="run" @keydown.esc.stop.prevent="emit('close')" />
        <button type="button" aria-label="关闭命令面板" @click="emit('close')">Esc</button>
      </header>
      <div id="command-results" role="listbox" aria-label="可用命令" class="command-results">
        <div v-for="(command, index) in commands" :id="'command-' + index" :key="command.id" role="option" :aria-selected="index === selected" class="command-option" @pointermove="selected = index" @click="emit('run', command.id)"><span>{{ command.label }}</span><small>{{ command.detail }}</small></div>
        <p v-if="!commands.length" role="status">未找到匹配的命令。</p>
      </div>
      <footer><span>↑ ↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></footer>
    </div>
  </dialog>
</template>
