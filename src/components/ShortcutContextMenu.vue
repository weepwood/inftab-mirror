<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Copy, Pencil, Pin, Trash2 } from '@lucide/vue'
import { maxDockItems, type LauncherItem } from '../types'

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
const menuItemCount = computed(() => props.item.shortcut ? 4 : 3)

function focusItem(index: number) {
  activeIndex.value = index
  void nextTick(() => menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  let nextIndex: number | undefined
  if (event.key === 'ArrowDown') nextIndex = (activeIndex.value + 1) % menuItemCount.value
  else if (event.key === 'ArrowUp') nextIndex = (activeIndex.value - 1 + menuItemCount.value) % menuItemCount.value
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = menuItemCount.value - 1
  if (nextIndex !== undefined) {
    event.preventDefault()
    focusItem(nextIndex)
  }
}

function handleFocusout(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  if (!(nextTarget instanceof Node) || !menu.value?.contains(nextTarget)) emit('close')
}

onMounted(() => focusItem(0))
</script>

<template>
  <div
    ref="menu"
    class="shortcut-context-menu"
    role="menu"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    @click.stop
    @keydown="handleKeydown"
    @focusout="handleFocusout"
  >
    <button type="button" role="menuitem" :tabindex="activeIndex === 0 ? 0 : -1" @click="emit('edit')"><Pencil :size="14" /> 编辑{{ item.folder ? '文件夹' : '快捷入口' }}</button>
    <button v-if="item.shortcut" type="button" role="menuitem" :tabindex="activeIndex === 1 ? 0 : -1" @click="emit('copy')"><Copy :size="14" /> 复制网址</button>
    <button type="button" role="menuitem" :tabindex="activeIndex === (item.shortcut ? 2 : 1) ? 0 : -1" :disabled="!dockItemIds.includes(item.id) && dockItemIds.length >= maxDockItems" @click="emit('toggleDock')"><Pin :size="14" /> {{ dockItemIds.includes(item.id) ? '从 Dock 移除' : '固定到 Dock' }}</button>
    <button type="button" role="menuitem" class="danger" :tabindex="activeIndex === (item.shortcut ? 3 : 2) ? 0 : -1" @click="emit('remove')"><Trash2 :size="14" /> 删除{{ item.folder ? '文件夹' : '快捷入口' }}</button>
  </div>
</template>
