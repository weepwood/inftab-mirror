<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FolderOpen, Pencil, Trash2, X } from '@lucide/vue'
import type { Shortcut, ShortcutFolder } from '../types'

const props = defineProps<{ folder?: ShortcutFolder; shortcuts: Shortcut[]; unavailableShortcutIds?: string[]; saveError?: string; limitReached?: boolean }>()
const emit = defineEmits<{
  close: []
  save: [folder: ShortcutFolder]
  remove: [id: string]
  openShortcut: [shortcut: Shortcut]
  openAllShortcuts: [shortcuts: Shortcut[]]
}>()

const editing = ref(!props.folder)
const title = ref(props.folder?.title ?? '')
const color = ref(props.folder?.color ?? '#4176e8')
const selectedIds = ref([...(props.folder?.shortcutIds ?? [])])
const error = ref('')
const dialog = ref<HTMLElement>()
const titleInput = ref<HTMLInputElement>()
const shortcutById = computed(() => new Map(props.shortcuts.map((shortcut) => [shortcut.id, shortcut])))
const folderShortcutItems = computed(() => selectedIds.value.flatMap((id) => {
  const shortcut = shortcutById.value.get(id)
  return shortcut ? [shortcut] : []
}))
let returnFocusTarget: HTMLElement | undefined

watch(() => props.folder, (folder) => {
  editing.value = !folder
  title.value = folder?.title ?? ''
  color.value = folder?.color ?? '#4176e8'
  selectedIds.value = [...(folder?.shortcutIds ?? [])]
  error.value = ''
})

function focusInitialElement() {
  if (editing.value) titleInput.value?.focus()
  else dialog.value?.querySelector<HTMLElement>('.folder-link, header button')?.focus()
}

watch(editing, async () => {
  await nextTick()
  focusInitialElement()
})

onMounted(async () => {
  returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  await nextTick()
  focusInitialElement()
})
onBeforeUnmount(() => {
  if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
})

function toggleShortcut(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter((itemId) => itemId !== id)
}

function cancelEditing() {
  if (!props.folder) {
    emit('close')
    return
  }
  title.value = props.folder.title
  color.value = props.folder.color
  selectedIds.value = [...props.folder.shortcutIds]
  error.value = ''
  editing.value = false
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) {
    event.preventDefault()
    return
  }
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function save() {
  const cleanTitle = title.value.trim()
  if (!cleanTitle) {
    error.value = '请输入文件夹名称。'
    return
  }
  emit('save', {
    id: props.folder?.id ?? crypto.randomUUID(),
    title: cleanTitle.slice(0, 80),
    shortcutIds: [...new Set(selectedIds.value)],
    color: color.value,
    mark: '▣',
  })
}
</script>

<template>
  <div class="modal-backdrop folder-backdrop" @click.self="emit('close')">
    <section ref="dialog" class="shortcut-dialog folder-dialog" role="dialog" aria-modal="true" :aria-labelledby="editing ? 'folder-edit-title' : 'folder-view-title'" @keydown="handleDialogKeydown">
      <header>
        <div v-if="editing"><h2 id="folder-edit-title">{{ folder ? '编辑文件夹' : '新建文件夹' }}</h2><p>把常用网站整理到一个入口中</p></div>
        <div v-else class="folder-dialog-heading"><FolderOpen :size="21" :style="{ color: folder?.color }" /><div><h2 id="folder-view-title">{{ folder?.title }}</h2><p>{{ folderShortcutItems.length }} 个快捷入口</p></div></div>
        <button type="button" aria-label="关闭文件夹" @click="emit('close')"><X :size="19" /></button>
      </header>

      <template v-if="editing">
        <label>文件夹名称<input ref="titleInput" v-model="title" maxlength="80" placeholder="例如：工作" @input="error = ''" /></label>
        <label class="color-field">文件夹颜色<input v-model="color" type="color" /></label>
        <p class="folder-selection-label">选择要收纳的快捷入口</p>
        <div class="folder-choice-list">
          <label v-for="shortcut in shortcuts" :key="shortcut.id" class="folder-choice" :class="{ unavailable: unavailableShortcutIds?.includes(shortcut.id) }">
            <input type="checkbox" :checked="selectedIds.includes(shortcut.id)" :disabled="unavailableShortcutIds?.includes(shortcut.id)" @change="toggleShortcut(shortcut.id, ($event.target as HTMLInputElement).checked)" />
            <span class="folder-choice-mark" :style="{ backgroundColor: shortcut.color }">{{ shortcut.mark }}</span>
            <span>{{ shortcut.title }}<small v-if="unavailableShortcutIds?.includes(shortcut.id)">已在其他文件夹</small></span>
          </label>
          <p v-if="!shortcuts.length" class="folder-empty">先添加快捷入口，再将它们放入文件夹。</p>
        </div>
        <p v-if="limitReached" class="backup-error" role="status">最多只能保存 500 个文件夹。</p>
        <p v-if="error || saveError" class="backup-error" role="alert">{{ error || saveError }}</p>
        <footer>
          <button class="button-secondary" type="button" @click="cancelEditing">取消</button>
          <button class="button-primary" type="button" :disabled="limitReached" @click="save">保存文件夹</button>
        </footer>
      </template>

      <template v-else>
        <div v-if="folderShortcutItems.length" class="folder-toolbar">
          <span>将在 {{ folderShortcutItems.length }} 个新标签页打开</span>
          <button class="button-secondary" type="button" @click="emit('openAllShortcuts', folderShortcutItems)">打开全部</button>
        </div>
        <div class="folder-link-list">
          <button v-for="shortcut in folderShortcutItems" :key="shortcut.id" type="button" class="folder-link" @click="emit('openShortcut', shortcut)">
            <span class="folder-choice-mark" :style="{ backgroundColor: shortcut.color }">{{ shortcut.mark }}</span>
            <span class="folder-link-title">{{ shortcut.title }}</span><span class="folder-link-url">{{ shortcut.url }}</span>
          </button>
          <p v-if="!folderShortcutItems.length" class="folder-empty">这个文件夹还没有快捷入口。</p>
        </div>
        <footer>
          <button class="button-secondary danger-action" type="button" @click="folder && emit('remove', folder.id)"><Trash2 :size="15" /> 删除文件夹</button>
          <span class="folder-footer-spacer"></span>
          <button class="button-secondary" type="button" @click="editing = true"><Pencil :size="15" /> 编辑</button>
          <button class="button-primary" type="button" @click="emit('close')">完成</button>
        </footer>
      </template>
    </section>
  </div>
</template>
