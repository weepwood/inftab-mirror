<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, ArrowRight, Check, LayoutGrid, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { defaultHomeWorkspaceId, maxHomeWorkspaces, maxHomeWorkspaceNameLength, type HomeWorkspace } from '../data/homeWorkspaces'
import { truncateCodePoints } from '../data/text'

const props = defineProps<{
  workspaces: HomeWorkspace[]
  activeId: string
}>()
const emit = defineEmits<{
  select: [id: string]
  create: []
  rename: [id: string, name: string]
  move: [id: string, direction: -1 | 1]
  remove: [id: string]
}>()

const root = ref<HTMLDivElement>()
const chipList = ref<HTMLDivElement>()
const menu = ref<HTMLDivElement>()
const nameInput = ref<HTMLInputElement>()
const triggerButton = ref<HTMLButtonElement>()

const editing = ref(false)
const renamingId = ref('')
const menuOpen = ref(false)
const draft = ref('')
const nameError = ref('')
const contextWorkspace = ref<HomeWorkspace>()
const contextPosition = ref({ left: 0, top: 0 })
const hoveredWorkspaceId = ref('')
const arrowAngle = ref(0)
let closeTimer = 0
let touchInteraction = false

// Workspace chips fan out along a quarter circle anchored at the bottom-right corner.
const ARC_START = 8
const ARC_END = 90

function ringCounts(total: number) {
  if (total <= 3) return [total]
  if (total <= 7) return [3, total - 3]
  if (total <= 13) return [3, 4, total - 7]
  return [3, 4, 6, total - 13]
}

function slotStyle(index: number, total: number) {
  const counts = ringCounts(total)
  let ring = 0
  let ringIndex = index
  while (ringIndex >= counts[ring]!) {
    ringIndex -= counts[ring]!
    ring += 1
  }
  const count = counts[ring]!
  const step = count > 1 ? (ARC_END - ARC_START) / (count - 1) : 0
  const angle = count > 1 ? ARC_END - ringIndex * step : (ARC_START + ARC_END) / 2
  const radius = Math.max(88 + ring * 60, count > 1 ? 56 / (step * Math.PI / 180) : 88)
  const mobileRadius = counts.length === 1 ? 96 : 48 + ring * 36
  return {
    '--a': `${angle.toFixed(2)}deg`,
    '--r-open': `min(${Math.round(radius)}px, 40vmin)`,
    '--r-mobile': `${mobileRadius}px`,
    '--i': `${index}`,
    '--ring-i': `${ringIndex}`,
    '--n': `${total}`,
    '--ring': `${ring}`,
  }
}

// Chips show the first character; the full name stays on aria-label, title and the context menu.
function initial(name: string) {
  return truncateCodePoints(name.trim(), 1) || '·'
}

function indexOf(id: string) {
  return props.workspaces.findIndex((workspace) => workspace.id === id)
}

function openMenu() {
  if (closeTimer) {
    window.clearTimeout(closeTimer)
    closeTimer = 0
  }
  menuOpen.value = true
}

function handlePointerEnter(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    touchInteraction = true
    return
  }
  touchInteraction = false
  openMenu()
}

function handleFocusIn() {
  if (touchInteraction) return
  openMenu()
}

function handlePointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  hoveredWorkspaceId.value = ''
  scheduleClose()
}

function activateTrigger() {
  if (!menuOpen.value) {
    touchInteraction = false
    openMenu()
    return
  }
  if (props.workspaces.length < maxHomeWorkspaces) emit('create')
}

function pointToWorkspaceAt(workspace: HomeWorkspace, x: number, y: number) {
  hoveredWorkspaceId.value = workspace.id
  const origin = triggerButton.value?.getBoundingClientRect()
  if (!origin) return
  const dx = x - (origin.left + origin.width / 2)
  const dy = y - (origin.top + origin.height / 2)
  arrowAngle.value = Math.atan2(dy, dx) * 180 / Math.PI
}

function pointToWorkspace(event: PointerEvent, workspace: HomeWorkspace) {
  pointToWorkspaceAt(workspace, event.clientX, event.clientY)
}

function closeMenu() {
  if (closeTimer) {
    window.clearTimeout(closeTimer)
    closeTimer = 0
  }
  menuOpen.value = false
  hoveredWorkspaceId.value = ''
  cancelRename()
}

function scheduleClose() {
  if (contextWorkspace.value) return
  if (closeTimer) window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => {
    closeTimer = 0
    menuOpen.value = false
    cancelRename()
  }, 260)
}

function closeContextMenu() {
  if (!contextWorkspace.value) return
  contextWorkspace.value = undefined
  if (!root.value?.matches(':hover')) scheduleClose()
}

function focusFirstMenuItem() {
  void nextTick(() => menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')[0]?.focus())
}

function showContextMenu(workspace: HomeWorkspace, x: number, y: number) {
  const width = 172
  const height = 192
  contextPosition.value = {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  }
  contextWorkspace.value = workspace
  openMenu()
  focusFirstMenuItem()
}

function openContextMenu(event: MouseEvent, workspace: HomeWorkspace) {
  event.preventDefault()
  showContextMenu(workspace, event.clientX, event.clientY)
}

function handleWindowClick(event: MouseEvent) {
  closeContextMenu()
  if (editing.value && !root.value?.contains(event.target as Node)) cancelRename()
}

function beginRename(workspace?: HomeWorkspace) {
  const target = workspace ?? props.workspaces.find((item) => item.id === renamingId.value)
  if (!target) return
  renamingId.value = target.id
  draft.value = target.name
  nameError.value = ''
  closeContextMenu()
  editing.value = true
  openMenu()
  void nextTick(() => nameInput.value?.focus())
}

function cancelRename() {
  editing.value = false
  nameError.value = ''
}

function commitRename() {
  const workspace = props.workspaces.find((item) => item.id === renamingId.value)
  const name = truncateCodePoints(draft.value.trim(), maxHomeWorkspaceNameLength)
  if (!workspace || !name) {
    nameError.value = '请输入工作区名称。'
    return
  }
  if (props.workspaces.some((item) => item.id !== workspace.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    nameError.value = '这个名称已被使用。'
    return
  }
  emit('rename', workspace.id, name)
  cancelRename()
}

function requestMove(id: string, direction: -1 | 1) {
  closeContextMenu()
  emit('move', id, direction)
}

function requestRemove(id: string) {
  closeContextMenu()
  emit('remove', id)
}

function handleChipKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    const workspace = props.workspaces[index]
    if (!workspace) return
    event.preventDefault()
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    showContextMenu(workspace, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
    return
  }
  const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!direction) return
  event.preventDefault()
  const nextIndex = (index + direction + props.workspaces.length) % props.workspaces.length
  const next = props.workspaces[nextIndex]
  if (!next) return
  emit('select', next.id)
  void nextTick(() => chipList.value?.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]')[nextIndex]?.focus())
}

onMounted(() => window.addEventListener('click', handleWindowClick))
onBeforeUnmount(() => {
  if (closeTimer) window.clearTimeout(closeTimer)
  window.removeEventListener('click', handleWindowClick)
})
</script>

<template>
  <div
    ref="root"
    class="home-workspace-bar"
    :class="{ 'is-open': menuOpen, 'is-pointing': hoveredWorkspaceId, 'is-editing': editing }"
    :style="{ '--arrow-angle': `${arrowAngle}deg` }"
    role="region"
    aria-label="主页工作区"
    @pointerenter="handlePointerEnter"
    @pointerleave="handlePointerLeave"
    @focusin="handleFocusIn"
    @keydown.esc="closeMenu"
  >
    <button
      ref="triggerButton"
      type="button"
      class="home-workspace-trigger"
      :aria-label="hoveredWorkspaceId ? '指向工作区' : menuOpen ? '新建工作区' : '展开工作区菜单'"
      aria-haspopup="true"
      :aria-expanded="menuOpen"
      @click="activateTrigger"
    >
      <LayoutGrid v-if="!menuOpen" :size="22" />
      <ArrowRight v-else-if="hoveredWorkspaceId" :size="22" />
      <Plus v-else :size="22" />
    </button>

    <div ref="chipList" class="home-workspace-radial" role="group" aria-label="切换工作区">
      <div
        v-for="(workspace, index) in workspaces"
        :key="workspace.id"
        class="home-workspace-slot"
        :style="slotStyle(index, workspaces.length)"
      >
        <button
          :data-workspace-tab="workspace.id"
          class="home-workspace-tab"
          :class="{ active: workspace.id === activeId }"
          type="button"
          :aria-pressed="workspace.id === activeId"
          :aria-label="workspace.name"
          :title="workspace.name"
          @click="emit('select', workspace.id)"
          @keydown="handleChipKeydown($event, index)"
          @contextmenu="openContextMenu($event, workspace)"
          @pointerenter="pointToWorkspace($event, workspace)"
          @pointermove="pointToWorkspace($event, workspace)"
          @pointerleave="hoveredWorkspaceId = ''"
        >{{ initial(workspace.name) }}</button>
      </div>
    </div>

    <form v-if="editing" class="home-workspace-rename" @submit.prevent="commitRename" @keydown.esc.stop.prevent="cancelRename">
      <input ref="nameInput" v-model="draft" maxlength="40" aria-label="工作区名称" />
      <button type="submit" class="home-workspace-form-button" aria-label="保存工作区名称"><Check :size="15" /></button>
      <button type="button" class="home-workspace-form-button" aria-label="取消重命名" @click="cancelRename"><X :size="15" /></button>
      <span v-if="nameError" class="home-workspace-error" role="alert">{{ nameError }}</span>
    </form>

    <div
      v-if="contextWorkspace"
      ref="menu"
      class="shortcut-context-menu workspace-context-menu"
      role="menu"
      :aria-label="`${contextWorkspace.name} 的操作`"
      :style="{ left: `${contextPosition.left}px`, top: `${contextPosition.top}px` }"
      @click.stop
      @keydown.esc.stop.prevent="closeContextMenu"
    >
      <p class="context-menu-title" role="presentation">{{ contextWorkspace.name }}</p>
      <button type="button" role="menuitem" @click="beginRename(contextWorkspace)"><Pencil :size="14" /> 重命名</button>
      <button type="button" role="menuitem" :disabled="indexOf(contextWorkspace.id) <= 1" @click="requestMove(contextWorkspace.id, -1)"><ArrowLeft :size="14" /> 左移</button>
      <button type="button" role="menuitem" :disabled="indexOf(contextWorkspace.id) <= 0 || indexOf(contextWorkspace.id) >= workspaces.length - 1" @click="requestMove(contextWorkspace.id, 1)"><ArrowRight :size="14" /> 右移</button>
      <button type="button" role="menuitem" class="danger" :disabled="contextWorkspace.id === defaultHomeWorkspaceId" @click="requestRemove(contextWorkspace.id)"><Trash2 :size="14" /> 删除</button>
    </div>
  </div>
</template>
