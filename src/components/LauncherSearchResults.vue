<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowUpRight, Folder, FolderPlus, Plus, Search } from '@lucide/vue'
import { createLauncherSearchIndex, type LauncherSearchMatch } from '../data/launcherSearch'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { LauncherItem, ShortcutFolder } from '../types'
import { launcherIcons } from './launcherIcons'

const props = defineProps<{
  query: string
  items: LauncherItem[]
  folders: ShortcutFolder[]
  workspaces: HomeWorkspace[]
  activeWorkspaceId: string
  hiddenItemIds: string[]
}>()
const emit = defineEmits<{
  open: [match: LauncherSearchMatch, event?: MouseEvent]
  focusSearch: []
  addShortcut: []
  addFolder: []
}>()
const allWorkspaces = ref(false)
const limit = ref(12)
const list = ref<HTMLElement>()
const popup = ref<HTMLElement>()
const popupStyle = ref<Record<string, string>>({})
const searchIndex = computed(() => createLauncherSearchIndex({ items: props.items, folders: props.folders, workspaces: props.workspaces, hiddenItemIds: props.hiddenItemIds }))
const matches = computed(() => props.query.trim() ? searchIndex.value.search(props.query, props.activeWorkspaceId, allWorkspaces.value) : [])
const visibleMatches = computed(() => matches.value.slice(0, limit.value))
watch([() => props.query, allWorkspaces], () => { limit.value = 12 })

function positionPopup() {
  const bounds = popup.value?.closest('.search-area')?.querySelector('.search-box')?.getBoundingClientRect()
  if (!bounds) return
  const height = document.documentElement.clientHeight || window.innerHeight
  const below = Math.max(0, height - bounds.bottom - 16)
  const above = Math.max(0, bounds.top - 16)
  const openAbove = below < 220 && above > below
  popupStyle.value = {
    top: openAbove ? 'auto' : 'calc(100% + 8px)',
    bottom: openAbove ? 'calc(100% + 8px)' : 'auto',
    maxHeight: `${Math.min(440, openAbove ? above : below)}px`,
  }
}

onMounted(() => {
  positionPopup()
  window.addEventListener('resize', positionPopup)
  window.addEventListener('scroll', positionPopup, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', positionPopup)
  window.removeEventListener('scroll', positionPopup, true)
})

function label(match: LauncherSearchMatch) {
  return [allWorkspaces.value && match.workspaceId !== props.activeWorkspaceId ? match.workspaceName : '', match.folderTitle, match.item.title].filter(Boolean).join(' · ')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  const results = [...(list.value?.querySelectorAll<HTMLButtonElement>('.local-search-result') ?? [])]
  const index = results.indexOf(event.currentTarget as HTMLButtonElement)
  if (event.key === 'ArrowUp' && index === 0) {
    event.preventDefault()
    emit('focusSearch')
    return
  }
  const next = event.key === 'ArrowDown' ? Math.min(index + 1, results.length - 1)
    : event.key === 'ArrowUp' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0
      : event.key === 'End' ? results.length - 1 : -1
  if (next >= 0) {
    event.preventDefault()
    results[next]?.focus()
  }
}
</script>

<template>
  <div ref="popup" class="local-search-results launcher-search" :style="popupStyle" aria-label="快捷入口查找">
    <div class="launcher-search-toolbar">
      <div class="launcher-search-scopes" role="group" aria-label="查找范围">
        <button type="button" :aria-pressed="!allWorkspaces" @click="allWorkspaces = false">当前工作区</button>
        <button type="button" :aria-pressed="allWorkspaces" @click="allWorkspaces = true">全部工作区</button>
      </div>
      <span v-if="query.trim()" class="launcher-search-count" role="status">{{ matches.length }} 项结果</span>
      <span v-else class="launcher-search-count">本地查找</span>
    </div>
    <div id="launcher-search-list" ref="list" role="listbox" aria-label="快捷入口搜索结果">
      <button
        v-for="match in visibleMatches"
        :key="match.item.id"
        type="button"
        role="option"
        aria-selected="false"
        class="local-search-result"
        :aria-label="label(match)"
        :aria-description="match.item.action ? '内置工具' : `位于${match.workspaceName}${match.folderTitle ? '，' + match.folderTitle : ''}`"
        @click="emit('open', match, $event)"
        @auxclick.middle.prevent="emit('open', match, $event)"
        @keydown="handleKeydown"
      >
        <span class="launcher-search-icon" aria-hidden="true">
          <component :is="launcherIcons[match.item.action]" v-if="match.item.action" :size="20" :stroke-width="1.7" />
          <Folder v-else-if="match.item.folder" :size="20" :stroke-width="1.7" />
          <span v-else>{{ Array.from(match.item.title).slice(0, 1).join('').toUpperCase() }}</span>
        </span>
        <span class="launcher-search-copy">
          <span class="local-search-result-title">{{ match.item.title }}</span>
          <span class="launcher-search-location">{{ match.item.action ? '内置工具' : `${match.workspaceName}${match.folderTitle ? ' / ' + match.folderTitle : ''}` }}<span v-if="match.item.shortcut" class="local-search-result-url"> · {{ match.item.shortcut.url.replace(/^https?:\/\//, '').replace(/\/$/, '') }}</span></span>
        </span>
        <ArrowUpRight class="launcher-search-open" :size="16" aria-hidden="true" />
      </button>
    </div>
    <div v-if="!matches.length" class="launcher-search-empty local-search-empty">
      <Search :size="24" :stroke-width="1.5" aria-hidden="true" />
      <p role="status">{{ query.trim() ? '没有匹配的快捷入口' : '想去哪里？从这里找起' }}</p>
      <span>{{ query.trim() ? '试试名称、网址、标签或文件夹名称，也可以切换查找范围。' : '查找网站、文件夹和内置工具，不必逐页翻找。' }}</span>
      <div class="launcher-search-actions">
        <button type="button" @click="emit('addShortcut')"><Plus :size="14" aria-hidden="true" />添加快捷入口</button>
        <button type="button" @click="emit('addFolder')"><FolderPlus :size="14" aria-hidden="true" />创建文件夹</button>
      </div>
    </div>
    <button v-if="matches.length > limit" class="launcher-search-more" type="button" @click="limit += 12">显示更多（还有 {{ matches.length - limit }} 项）</button>
    <p id="launcher-search-help" class="launcher-search-help"><span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 返回</span><span>搜索词不离开本机</span></p>
  </div>
</template>
