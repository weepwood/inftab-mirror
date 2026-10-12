<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, Plus, Pencil, Trash2, X } from '@lucide/vue'
import { defaultHomeWorkspaceId, maxHomeWorkspaces, maxHomeWorkspaceNameLength, type HomeWorkspace } from '../data/homeWorkspaces'

const props = defineProps<{
  workspaces: HomeWorkspace[]
  activeId: string
}>()
const emit = defineEmits<{
  select: [id: string]
  create: []
  rename: [id: string, name: string]
  remove: [id: string]
}>()
const editing = ref(false)
const draft = ref('')
const nameError = ref('')
const nameInput = ref<HTMLInputElement>()
const tablist = ref<HTMLDivElement>()
const activeWorkspace = () => props.workspaces.find((workspace) => workspace.id === props.activeId) ?? props.workspaces[0]

function beginRename() {
  const workspace = activeWorkspace()
  if (!workspace) return
  draft.value = workspace.name
  nameError.value = ''
  editing.value = true
  void nextTick(() => nameInput.value?.focus())
}

function cancelRename() {
  editing.value = false
  nameError.value = ''
}

function commitRename() {
  const workspace = activeWorkspace()
  const name = draft.value.trim().slice(0, maxHomeWorkspaceNameLength)
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

function handleTabKeydown(event: KeyboardEvent, index: number) {
  const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!direction) return
  event.preventDefault()
  const nextIndex = (index + direction + props.workspaces.length) % props.workspaces.length
  const next = props.workspaces[nextIndex]
  if (!next) return
  emit('select', next.id)
  void nextTick(() => tablist.value?.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]')[nextIndex]?.focus())
}
</script>

<template>
  <div class="home-workspace-bar" role="region" aria-label="主页工作区">
    <div ref="tablist" class="home-workspace-tablist" role="group" aria-label="切换工作区">
      <button
        v-for="(workspace, index) in workspaces"
        :key="workspace.id"
        :data-workspace-tab="workspace.id"
        class="home-workspace-tab"
        :class="{ active: workspace.id === activeId }"
        type="button"
        :aria-pressed="workspace.id === activeId"
        @click="emit('select', workspace.id)"
        @keydown="handleTabKeydown($event, index)"
      >{{ workspace.name }}</button>
    </div>

    <form v-if="editing" class="home-workspace-rename" @submit.prevent="commitRename" @keydown.esc.prevent="cancelRename">
      <input ref="nameInput" v-model="draft" maxlength="40" aria-label="工作区名称" />
      <button type="submit" class="home-workspace-action" aria-label="保存工作区名称"><Check :size="15" /></button>
      <button type="button" class="home-workspace-action" aria-label="取消重命名" @click="cancelRename"><X :size="15" /></button>
      <span v-if="nameError" class="home-workspace-error" role="alert">{{ nameError }}</span>
    </form>

    <div v-else class="home-workspace-actions">
      <button type="button" class="home-workspace-action" aria-label="新建工作区" :disabled="workspaces.length >= maxHomeWorkspaces" @click="emit('create')"><Plus :size="15" /></button>
      <button type="button" class="home-workspace-action" aria-label="重命名当前工作区" @click="beginRename"><Pencil :size="14" /></button>
      <button type="button" class="home-workspace-action" aria-label="删除当前工作区" :disabled="activeId === defaultHomeWorkspaceId" @click="emit('remove', activeId)"><Trash2 :size="14" /></button>
    </div>
  </div>
</template>
