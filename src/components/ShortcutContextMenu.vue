<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { Copy, Pencil, Pin, Trash2 } from '@lucide/vue'
import { maxDockItems, type LauncherItem } from '../types'
import { closeMenuOnFocusout, navigateMenu } from './menuNavigation'

const props = defineProps<{
  item: LauncherItem
  dockItemIds: string[]
  position: { left: number; top: number }
}>()
const emit = defineEmits<{
  close: []
  edit: []
  copy: []
  toggleDock: []
  remove: []
}>()

const menu = ref<HTMLElement>()
const activeIndex = ref(0)
function handleFocusin(event: FocusEvent) {
  const items = menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')
  if (items) activeIndex.value = [...items].indexOf(event.target as HTMLElement)
}

onMounted(() => { void nextTick(() => menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()) })
</script>

<template>
  <div
    ref="menu"
    class="shortcut-context-menu"
    role="menu"
    :aria-label="`${item.title} 的操作`"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    @click.stop
    @keydown="navigateMenu"
    @focusin="handleFocusin"
    @focusout="closeMenuOnFocusout($event, () => emit('close'))"
  >
    <button type="button" role="menuitem" :tabindex="activeIndex === 0 ? 0 : -1" @click="emit('edit')"><Pencil :size="14" /> 编辑{{ item.folder ? '文件夹' : '快捷入口' }}</button>
    <button v-if="item.shortcut" type="button" role="menuitem" :tabindex="activeIndex === 1 ? 0 : -1" @click="emit('copy')"><Copy :size="14" /> 复制网址</button>
    <button type="button" role="menuitem" :tabindex="activeIndex === (item.shortcut ? 2 : 1) ? 0 : -1" :disabled="!dockItemIds.includes(item.id) && dockItemIds.length >= maxDockItems" @click="emit('toggleDock')"><Pin :size="14" /> {{ dockItemIds.includes(item.id) ? '从 Dock 移除' : '固定到 Dock' }}</button>
    <button type="button" role="menuitem" class="danger" :tabindex="activeIndex === (item.shortcut ? 3 : 2) ? 0 : -1" @click="emit('remove')"><Trash2 :size="14" /> 删除{{ item.folder ? '文件夹' : '快捷入口' }}</button>
  </div>
</template>
