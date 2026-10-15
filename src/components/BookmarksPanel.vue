<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bookmark, ChevronDown, ChevronRight, ExternalLink, Folder, Plus } from '@lucide/vue'
import {
  canAccessBrowserBookmarks,
  getBrowserBookmarkTree,
  hasBrowserBookmarksPermission,
  requestBrowserBookmarksPermission,
  subscribeToBrowserBookmarkPermissionChanges,
  subscribeToBrowserBookmarks,
} from '../data/browserBookmarks'
import { normalizeWebUrl } from '../data/urls'
import type { BookmarkShortcutCandidate, BookmarkShortcutImportResult, BrowserBookmarkNode } from '../types'

const props = withDefaults(defineProps<{
  availableSlots: number
  importBookmarks: (items: BookmarkShortcutCandidate[]) => BookmarkShortcutImportResult
}>(), {
  availableSlots: 500,
  importBookmarks: () => ({ added: 0, error: '批量导入暂不可用。' }),
})

interface BookmarkRow {
  id: string
  title: string
  depth: number
  url?: string
  isFolder: boolean
  hasChildren: boolean
  expanded: boolean
}

const emit = defineEmits<{ addShortcut: [title: string, url: string] }>()
const supported = canAccessBrowserBookmarks()
const permissionGranted = ref(false)
const loading = ref(false)
const requestingPermission = ref(false)
const error = ref('')
const query = ref('')
const tree = ref<BrowserBookmarkNode[]>([])
const bookmarkCandidatesById = ref(new Map<string, BookmarkShortcutCandidate>())
const expandedIds = ref(new Set<string>())
const selectedIds = ref(new Set<string>())
const visibleRowCount = ref(100)
const importMessage = ref('')
let stopListening: (() => void) | undefined
let stopWatchingPermission: (() => void) | undefined
let refreshSequence = 0
let permissionSequence = 0
let bookmarkRefreshTimer: ReturnType<typeof setTimeout> | undefined

const rows = computed(() => {
  const cleanQuery = query.value.trim().toLocaleLowerCase()
  const subtreeMatches = new Map<string, boolean>()
  if (cleanQuery) {
    const matchStack = tree.value.flatMap((root) => [...(root.children ?? [])].reverse().map((node) => ({ node, visited: false })))
    while (matchStack.length) {
      const entry = matchStack.pop()!
      const children = entry.node.children
      if (children !== undefined && !entry.visited) {
        matchStack.push({ node: entry.node, visited: true })
        for (let index = children.length - 1; index >= 0; index -= 1) {
          matchStack.push({ node: children[index]!, visited: false })
        }
        continue
      }
      if (children !== undefined) {
        subtreeMatches.set(entry.node.id, entry.node.title.toLocaleLowerCase().includes(cleanQuery)
          || children.some((child) => subtreeMatches.get(child.id) === true))
        continue
      }
      const url = normalizeWebUrl(entry.node.url)
      subtreeMatches.set(entry.node.id, Boolean(url && (entry.node.title + ' ' + url).toLocaleLowerCase().includes(cleanQuery)))
    }
  }

  const result: BookmarkRow[] = []
  const stack = tree.value.flatMap((root) => [...(root.children ?? [])].reverse().map((node) => ({ node, depth: 0 })))
  while (stack.length) {
    const { node, depth } = stack.pop()!
    const children = node.children ?? []
    if (node.children !== undefined) {
      if (cleanQuery && !subtreeMatches.get(node.id)) continue
      const expanded = Boolean(children.length && (cleanQuery || expandedIds.value.has(node.id)))
      result.push({ id: node.id, title: node.title || '未命名文件夹', depth, isFolder: true, hasChildren: children.length > 0, expanded })
      if (expanded) {
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push({ node: children[index]!, depth: depth + 1 })
        }
      }
      continue
    }
    const url = normalizeWebUrl(node.url)
    if (!url || (cleanQuery && !subtreeMatches.get(node.id))) continue
    result.push({ id: node.id, title: node.title || url, depth, url, isFolder: false, hasChildren: false, expanded: false })
  }
  return result
})

const visibleBookmarkRows = computed(() => rows.value.filter((row) => !row.isFolder && row.url))
const displayedRows = computed(() => rows.value.slice(0, visibleRowCount.value))
const selectedCandidates = computed(() => {
  return [...selectedIds.value].flatMap((id) => {
    const candidate = bookmarkCandidatesById.value.get(id)
    return candidate ? [candidate] : []
  })
})

watch([query, tree], () => { visibleRowCount.value = 100 })

async function refreshBookmarks() {
  const sequence = ++refreshSequence
  loading.value = true
  error.value = ''
  try {
    const nextTree = await getBrowserBookmarkTree()
    if (sequence !== refreshSequence) return
    tree.value = nextTree
    const validIds = new Set<string>()
    const candidatesById = new Map<string, BookmarkShortcutCandidate>()
    const stack = [...nextTree].reverse()
    while (stack.length) {
      const node = stack.pop()!
      if (node.children !== undefined) {
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
          stack.push(node.children[index]!)
        }
      } else {
        const url = normalizeWebUrl(node.url)
        if (url) {
          validIds.add(node.id)
          candidatesById.set(node.id, { title: node.title || url, url })
        }
      }
    }
    bookmarkCandidatesById.value = candidatesById
    selectedIds.value = new Set([...selectedIds.value].filter((id) => validIds.has(id)))
    const rootFolders = new Set(nextTree.flatMap((root) => (root.children ?? []).map((node) => node.id)))
    expandedIds.value = new Set([...expandedIds.value, ...rootFolders])
  } catch {
    if (sequence === refreshSequence) error.value = '无法读取浏览器书签，请检查扩展权限后重试。'
  } finally {
    if (sequence === refreshSequence) loading.value = false
  }
}

function watchBookmarkChanges() {
  if (!stopListening) stopListening = subscribeToBrowserBookmarks(queueBookmarkRefresh)
}

function cancelQueuedBookmarkRefresh() {
  if (bookmarkRefreshTimer !== undefined) clearTimeout(bookmarkRefreshTimer)
  bookmarkRefreshTimer = undefined
}

function queueBookmarkRefresh() {
  if (!permissionGranted.value) return
  cancelQueuedBookmarkRefresh()
  bookmarkRefreshTimer = setTimeout(() => {
    bookmarkRefreshTimer = undefined
    if (permissionGranted.value) void refreshBookmarks()
  }, 100)
}

async function syncBookmarkPermission() {
  const sequence = ++permissionSequence
  try {
    const granted = await hasBrowserBookmarksPermission()
    if (sequence !== permissionSequence) return
    permissionGranted.value = granted
    if (granted) {
      watchBookmarkChanges()
      await refreshBookmarks()
    } else {
      cancelQueuedBookmarkRefresh()
      refreshSequence += 1
      stopListening?.()
      stopListening = undefined
      tree.value = []
      bookmarkCandidatesById.value = new Map()
      selectedIds.value = new Set()
      loading.value = false
      error.value = ''
    }
  } catch {
    if (sequence !== permissionSequence) return
    cancelQueuedBookmarkRefresh()
    refreshSequence += 1
    stopListening?.()
    stopListening = undefined
    permissionGranted.value = false
    tree.value = []
    bookmarkCandidatesById.value = new Map()
    selectedIds.value = new Set()
    loading.value = false
    error.value = '无法检查浏览器书签权限。'
  }
}

function handleBookmarkPermissionChange() {
  permissionSequence += 1
  refreshSequence += 1
  cancelQueuedBookmarkRefresh()
  stopListening?.()
  stopListening = undefined
  permissionGranted.value = false
  tree.value = []
  bookmarkCandidatesById.value = new Map()
  selectedIds.value = new Set()
  loading.value = false
  error.value = ''
  importMessage.value = ''
  void syncBookmarkPermission()
}

async function enableBookmarks() {
  if (requestingPermission.value) return
  const sequence = ++permissionSequence
  requestingPermission.value = true
  error.value = ''
  try {
    const granted = await requestBrowserBookmarksPermission()
    if (sequence !== permissionSequence) return
    permissionGranted.value = granted
    if (permissionGranted.value) {
      watchBookmarkChanges()
      await refreshBookmarks()
    } else {
      error.value = '未授予书签权限。你仍可稍后在扩展设置中启用。'
    }
  } catch {
    if (sequence === permissionSequence) error.value = '无法请求书签权限，请稍后重试。'
  } finally {
    requestingPermission.value = false
  }
}

function toggleFolder(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function toggleBookmark(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) {
    if (next.size >= props.availableSlots) return
    next.add(id)
  } else next.delete(id)
  selectedIds.value = next
  importMessage.value = ''
}

function toggleVisibleBookmarks() {
  const visibleIds = visibleBookmarkRows.value.map((row) => row.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.value.has(id))
  const next = new Set(selectedIds.value)
  if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
  else {
    for (const id of visibleIds) {
      if (next.size >= props.availableSlots) break
      next.add(id)
    }
  }
  selectedIds.value = next
  importMessage.value = ''
}

function clearSelectedBookmarks() {
  selectedIds.value = new Set()
  importMessage.value = ''
}

function showMoreBookmarkRows() {
  visibleRowCount.value += 100
}

function importSelectedBookmarks() {
  if (!selectedCandidates.value.length) return
  if (selectedCandidates.value.length > props.availableSlots) {
    importMessage.value = '可用快捷入口数量不足，请减少选择后重试。'
    return
  }
  const result = props.importBookmarks(selectedCandidates.value)
  if (result.error) {
    importMessage.value = result.error
    return
  }
  importMessage.value = `已导入 ${result.added} 个快捷入口。`
  selectedIds.value = new Set()
}

onMounted(async () => {
  if (!supported) return
  stopWatchingPermission = subscribeToBrowserBookmarkPermissionChanges(handleBookmarkPermissionChange)
  await syncBookmarkPermission()
})

onBeforeUnmount(() => {
  permissionSequence += 1
  refreshSequence += 1
  cancelQueuedBookmarkRefresh()
  stopListening?.()
  stopWatchingPermission?.()
})
</script>

<template>
  <div class="browser-bookmarks-content">
    <label v-if="permissionGranted" class="field-label bookmark-search">筛选书签
      <input v-model="query" type="search" aria-label="筛选浏览器书签" placeholder="搜索名称或网址" />
    </label>
    <div v-if="permissionGranted && visibleBookmarkRows.length" class="bookmark-bulk-actions">
      <span>已选 {{ selectedIds.size }} / 可添加 {{ availableSlots }}</span>
      <button class="text-button" type="button" @click="toggleVisibleBookmarks">
        {{ visibleBookmarkRows.length > 0 && visibleBookmarkRows.every((row) => selectedIds.has(row.id)) ? '取消选择当前结果' : '选择当前结果' }}
      </button>
      <button v-if="selectedIds.size" class="text-button" type="button" aria-label="清空书签选择" @click="clearSelectedBookmarks">清空选择</button>
      <button class="button-primary" type="button" :disabled="!selectedCandidates.length || selectedCandidates.length > availableSlots" @click="importSelectedBookmarks">
        添加所选书签
      </button>
    </div>
    <p v-if="importMessage" class="bookmark-import-message" role="status">{{ importMessage }}</p>

    <div v-if="!supported" class="empty-state">
      <Bookmark :size="30" />
      <p>此功能需要浏览器扩展</p>
      <small>请在已安装的 Chrome 或 Edge 新标签页中查看浏览器书签。</small>
    </div>
    <div v-else-if="!permissionGranted" class="bookmark-permission">
      <Bookmark :size="30" />
      <p>连接当前浏览器的书签</p>
      <small>仅在你启用后读取书签；数据留在本地，不会上传。</small>
      <button class="button-primary" type="button" :disabled="requestingPermission" @click="enableBookmarks">
        {{ requestingPermission ? '正在请求权限…' : '启用书签' }}
      </button>
    </div>
    <div v-else-if="loading && !tree.length" class="empty-state"><p>正在读取书签…</p></div>
    <p v-if="error" class="backup-error" role="alert">{{ error }}</p>
    <div v-if="permissionGranted && !loading && !rows.length && !error" class="empty-state">
      <Bookmark :size="27" />
      <p>{{ query ? '没有匹配的书签' : '浏览器中还没有可显示的书签' }}</p>
    </div>
    <ul v-if="permissionGranted && rows.length" class="browser-bookmark-list" aria-label="浏览器书签">
      <li v-for="row in displayedRows" :key="row.id" :style="{ paddingLeft: (10 + row.depth * 16) + 'px' }">
        <button
          v-if="row.isFolder && row.hasChildren"
          class="browser-bookmark-folder"
          type="button"
          :aria-expanded="row.expanded"
          @click="toggleFolder(row.id)"
        >
          <component :is="row.expanded ? ChevronDown : ChevronRight" :size="15" />
          <Folder :size="16" />
          <span>{{ row.title }}</span>
        </button>
        <div v-else-if="row.isFolder" class="browser-bookmark-folder empty-folder"><Folder :size="16" /><span>{{ row.title }}</span></div>
        <div v-else class="browser-bookmark-entry">
          <input
            class="browser-bookmark-select"
            type="checkbox"
            :aria-label="`选择${row.title}`"
            :checked="selectedIds.has(row.id)"
            :disabled="!selectedIds.has(row.id) && selectedIds.size >= availableSlots"
            @change="toggleBookmark(row.id, ($event.target as HTMLInputElement).checked)"
          />
          <a class="browser-bookmark-link" :href="row.url" target="_blank" rel="noopener noreferrer">
            <Bookmark :size="15" />
            <span>{{ row.title }}</span>
            <ExternalLink :size="13" />
          </a>
          <button class="browser-bookmark-add" type="button" :aria-label="`添加${row.title}到快捷入口`" @click="emit('addShortcut', row.title, row.url ?? '')">
            <Plus :size="16" />
          </button>
        </div>
      </li>
      <li v-if="displayedRows.length < rows.length" class="bookmark-list-more">
        <p role="status" aria-live="polite">已显示 {{ displayedRows.length.toLocaleString('zh-CN') }} / {{ rows.length.toLocaleString('zh-CN') }} 条书签记录</p>
        <button class="text-button" type="button" @click="showMoreBookmarkRows">继续显示书签</button>
      </li>
    </ul>
  </div>
</template>
