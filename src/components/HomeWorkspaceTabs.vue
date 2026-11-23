<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, LayoutGrid, MoreHorizontal, Plus, Search } from '@lucide/vue'
import { defaultHomeWorkspaceId, maxHomeWorkspaces, maxHomeWorkspaceNameLength, type HomeWorkspace } from '../data/homeWorkspaces'
import { navigateMenu } from './menuNavigation'

const props = defineProps<{
  workspaces: HomeWorkspace[]
  activeId: string
  createWorkspace: (name: string) => boolean
  renameWorkspace: (id: string, name: string) => boolean
}>()
const emit = defineEmits<{
  select: [id: string]
  move: [id: string, direction: -1 | 1]
  remove: [id: string]
}>()

const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const open = ref(false)
const query = ref('')
const actionId = ref('')
const editingId = ref<string | null>(null) // empty string means create
const draft = ref('')
const error = ref('')
const activeWorkspace = computed(() => props.workspaces.find((item) => item.id === props.activeId) ?? props.workspaces[0])
const filtered = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return props.workspaces.filter((item) => item.name.toLocaleLowerCase().includes(term))
})
const editingWorkspace = computed(() => props.workspaces.find((item) => item.id === editingId.value))

function focusTab(id: string) {
  void nextTick(() => [...(list.value?.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]') ?? [])]
    .find((button) => button.dataset.workspaceTab === id)?.focus())
}
function focusAction(id: string) {
  void nextTick(() => [...(list.value?.querySelectorAll<HTMLButtonElement>('[data-workspace-action]') ?? [])]
    .find((button) => button.dataset.workspaceAction === id)?.focus())
}
function close(restoreFocus = false) {
  open.value = false
  actionId.value = ''
  editingId.value = null
  query.value = ''
  error.value = ''
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}
function toggle() {
  if (open.value) return close()
  open.value = true
  focusTab(props.activeId)
}
function select(id: string) {
  emit('select', id)
  close(true)
}
function openActions(id: string) {
  if (actionId.value === id) { actionId.value = ''; return }
  actionId.value = id
  void nextTick(() => root.value?.querySelector<HTMLButtonElement>('.workspace-actions [role="menuitem"]:not(:disabled)')?.focus())
}
function closeActions(restoreFocus = false) {
  const id = actionId.value
  actionId.value = ''
  if (restoreFocus && id) focusAction(id)
}
function beginEdit(id: string) {
  editingId.value = id
  draft.value = id ? props.workspaces.find((item) => item.id === id)?.name ?? '' : ''
  error.value = ''
  actionId.value = ''
  void nextTick(() => { input.value?.focus(); if (id) input.value?.select() })
}
function cancelEdit() {
  const id = editingId.value
  editingId.value = null
  error.value = ''
  if (id) focusAction(id)
  else void nextTick(() => root.value?.querySelector<HTMLButtonElement>('.workspace-create')?.focus())
}
function saveEdit() {
  const name = draft.value.trim()
  if (!name) { error.value = '请输入工作区名称。'; return }
  if (Array.from(name).length > maxHomeWorkspaceNameLength) { error.value = `名称最多 ${maxHomeWorkspaceNameLength} 个字符。`; return }
  if (props.workspaces.some((item) => item.id !== editingId.value && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    error.value = '这个名称已被使用。'
    return
  }
  const id = editingId.value
  if (id === null) return
  const success = id ? props.renameWorkspace(id, name) : props.createWorkspace(name)
  if (!success) { error.value = id ? '保存失败，工作区可能已被删除。' : '创建失败，请检查名称和工作区数量。'; return }
  if (!id) { close(true); return }
  editingId.value = null
  query.value = ''
  focusAction(id)
}
function move(id: string, direction: -1 | 1) {
  closeActions()
  emit('move', id, direction)
  focusAction(id)
}
function remove(id: string) {
  close()
  trigger.value?.focus()
  emit('remove', id)
}
function onListKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const target = event.target as HTMLElement
  if (!target.matches('[data-workspace-tab]')) return
  const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]') ?? [])]
  const index = buttons.indexOf(target as HTMLButtonElement)
  if (index < 0 || !buttons.length) return
  event.preventDefault()
  event.stopPropagation()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
function onEscape(event: KeyboardEvent) {
  if (!open.value) return
  if (event.isComposing) { event.stopPropagation(); return }
  event.preventDefault()
  event.stopPropagation()
  if (editingId.value !== null) cancelEdit()
  else if (actionId.value) closeActions(true)
  else close(true)
}
function onFocusOut(event: FocusEvent) {
  if (open.value && event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close()
}
function preventCompositionSubmit(event: KeyboardEvent) {
  if (event.isComposing) event.preventDefault()
}
function onOutsidePointer(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close()
}
watch(() => props.workspaces, (items) => {
  if (actionId.value && !items.some((item) => item.id === actionId.value)) actionId.value = ''
  if (editingId.value && !items.some((item) => item.id === editingId.value)) {
    editingId.value = null
    error.value = ''
    void nextTick(() => trigger.value?.focus())
  }
})
onMounted(() => document.addEventListener('pointerdown', onOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))
</script>

<template>
  <div ref="root" class="home-workspace-bar" role="region" aria-label="主页工作区" @keydown.esc="onEscape" @focusout="onFocusOut" @pointerdown.stop @pointerup.stop @wheel.stop>
    <button ref="trigger" type="button" class="home-workspace-trigger" :aria-label="`切换工作区，当前：${activeWorkspace?.name ?? '主页'}`" :title="`当前工作区：${activeWorkspace?.name ?? '主页'}`" :aria-expanded="open" aria-controls="home-workspace-panel" @click="toggle">
      <LayoutGrid :size="18" aria-hidden="true" />
      <span>{{ activeWorkspace?.name ?? '主页' }}</span>
      <ChevronDown :size="16" :class="{ 'workspace-chevron-open': open }" aria-hidden="true" />
    </button>

    <div v-if="open" id="home-workspace-panel" class="workspace-panel">
      <div class="workspace-panel-heading"><strong>工作区</strong><span>{{ workspaces.length }} / {{ maxHomeWorkspaces }}</span></div>
      <template v-if="editingId === null">
        <label v-if="workspaces.length > 8" class="workspace-filter">
          <Search :size="16" aria-hidden="true" />
          <input v-model="query" type="search" placeholder="查找工作区" aria-label="查找工作区" />
        </label>
        <div ref="list" class="workspace-list" role="group" aria-label="切换工作区" @keydown="onListKeydown">
          <div v-for="workspace in filtered" :key="workspace.id" class="workspace-row-wrap">
            <div class="workspace-row" :class="{ 'is-active': workspace.id === activeId }">
              <button type="button" class="home-workspace-tab" :data-workspace-tab="workspace.id" :aria-label="workspace.name" :aria-pressed="workspace.id === activeId" :title="workspace.name" @click="select(workspace.id)">
                <span class="workspace-icon"><LayoutGrid :size="16" aria-hidden="true" /></span>
                <span class="workspace-name">{{ workspace.name }}</span>
                <Check v-if="workspace.id === activeId" :size="17" aria-hidden="true" />
              </button>
              <button type="button" class="workspace-action" :data-workspace-action="workspace.id" :aria-label="`${workspace.name} 的操作`" aria-haspopup="menu" :aria-expanded="actionId === workspace.id" @click="openActions(workspace.id)"><MoreHorizontal :size="19" aria-hidden="true" /></button>
            </div>
            <div v-if="actionId === workspace.id" class="workspace-actions" role="menu" :aria-label="`${workspace.name} 的操作`" @keydown="navigateMenu">
              <button type="button" role="menuitem" @click="beginEdit(workspace.id)">重命名</button>
              <button type="button" role="menuitem" :disabled="workspaces.findIndex(item => item.id === workspace.id) <= 1" @click="move(workspace.id, -1)">上移</button>
              <button type="button" role="menuitem" :disabled="workspace.id === defaultHomeWorkspaceId || workspaces.findIndex(item => item.id === workspace.id) === workspaces.length - 1" @click="move(workspace.id, 1)">下移</button>
              <button type="button" role="menuitem" class="danger" :disabled="workspace.id === defaultHomeWorkspaceId" @click="remove(workspace.id)">删除工作区</button>
              <p v-if="workspace.id === defaultHomeWorkspaceId" class="workspace-pinned-hint">默认工作区固定在首位</p>
            </div>
          </div>
          <p v-if="!filtered.length" class="workspace-no-results">没有找到匹配的工作区</p>
        </div>
        <button type="button" class="workspace-create" :disabled="workspaces.length >= maxHomeWorkspaces" @click="beginEdit('')"><Plus :size="17" aria-hidden="true" /> {{ workspaces.length >= maxHomeWorkspaces ? '已达到 20 个工作区上限' : '新建工作区' }}</button>
      </template>
      <form v-else class="workspace-form" @submit.prevent="saveEdit" @keydown.enter="preventCompositionSubmit">
        <label for="workspace-name">{{ editingId ? '重命名工作区' : '新建工作区' }}</label>
        <input id="workspace-name" ref="input" v-model="draft" aria-label="工作区名称" :aria-invalid="!!error" :aria-describedby="error ? 'workspace-name-error' : undefined" placeholder="例如：工作" />
        <p v-if="error" id="workspace-name-error" class="workspace-form-error" role="alert">{{ error }}</p>
        <p v-else class="workspace-form-hint">名称最多 {{ maxHomeWorkspaceNameLength }} 个字符<span v-if="editingWorkspace"> · {{ editingWorkspace.name }}</span></p>
        <div class="workspace-form-actions"><button type="button" @click="cancelEdit">取消</button><button type="submit" class="workspace-submit">{{ editingId ? '保存' : '创建' }}</button></div>
      </form>
    </div>
  </div>
</template>
