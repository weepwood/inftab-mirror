<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Bookmark, ExternalLink } from '@lucide/vue'
import {
  canAccessBrowserBookmarks,
  getBrowserBookmarkTree,
  hasBrowserBookmarksPermission,
  subscribeToBrowserBookmarkPermissionChanges,
  subscribeToBrowserBookmarks,
} from '../data/browserBookmarks'
import { normalizeWebUrl } from '../data/urls'
import type { BrowserBookmarkNode } from '../types'

interface BookmarkPreview { id: string; title: string; url: string }

const supported = canAccessBrowserBookmarks()
const permissionGranted = ref(false)
const loading = ref(false)
const error = ref('')
const items = ref<BookmarkPreview[]>([])
let refreshSequence = 0
let permissionSequence = 0
let stopListening: (() => void) | undefined
let stopWatchingPermission: (() => void) | undefined

function previewBookmarks(tree: BrowserBookmarkNode[]): BookmarkPreview[] {
  const results: BookmarkPreview[] = []
  let visited = 0
  function visit(nodes: BrowserBookmarkNode[], depth: number) {
    for (const node of nodes) {
      visited += 1
      if (visited > 5000 || results.length >= 5 || depth > 32) return
      if (node.children) {
        visit(node.children, depth + 1)
        continue
      }
      const url = normalizeWebUrl(node.url)
      if (url) results.push({ id: node.id, title: node.title.trim().slice(0, 120) || url, url })
    }
  }
  visit(tree, 0)
  return results
}

async function refreshBookmarks() {
  const sequence = ++refreshSequence
  loading.value = true
  error.value = ''
  try {
    const tree = await getBrowserBookmarkTree()
    if (sequence === refreshSequence) items.value = previewBookmarks(tree)
  } catch {
    if (sequence === refreshSequence) error.value = '无法读取浏览器书签，请打开书签面板检查权限后重试。'
  } finally {
    if (sequence === refreshSequence) loading.value = false
  }
}

function watchBookmarkChanges() {
  if (!stopListening) stopListening = subscribeToBrowserBookmarks(() => { void refreshBookmarks() })
}

async function syncPermission() {
  const sequence = ++permissionSequence
  try {
    const granted = await hasBrowserBookmarksPermission()
    if (sequence !== permissionSequence) return
    permissionGranted.value = granted
    if (granted) {
      watchBookmarkChanges()
      await refreshBookmarks()
    } else {
      refreshSequence += 1
      stopListening?.()
      stopListening = undefined
      items.value = []
      loading.value = false
      error.value = ''
    }
  } catch {
    if (sequence === permissionSequence) error.value = '无法检查浏览器书签权限。'
  }
}

onMounted(() => {
  if (!supported) return
  stopWatchingPermission = subscribeToBrowserBookmarkPermissionChanges(() => { void syncPermission() })
  void syncPermission()
})

onBeforeUnmount(() => {
  permissionSequence += 1
  refreshSequence += 1
  stopListening?.()
  stopWatchingPermission?.()
})
</script>

<template>
  <div class="bookmarks-summary-widget" aria-label="浏览器书签概览" :aria-busy="loading">
    <p v-if="!supported" class="home-widget-empty">此功能需要浏览器扩展；可在书签面板中查看说明。</p>
    <p v-else-if="!permissionGranted" class="home-widget-empty">打开书签面板并启用权限后，这里会显示最近的书签。</p>
    <p v-else-if="loading && !items.length" class="home-widget-empty" role="status">正在读取浏览器书签…</p>
    <p v-else-if="error" class="home-widget-empty" role="alert">{{ error }}</p>
    <ul v-else-if="items.length" class="bookmarks-summary-list" aria-label="书签快捷入口">
      <li v-for="item in items" :key="item.id">
        <a :href="item.url" target="_blank" rel="noopener noreferrer" :title="item.url">
          <Bookmark :size="14" aria-hidden="true" />
          <span>{{ item.title }}</span>
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </li>
    </ul>
    <p v-else class="home-widget-empty">浏览器中还没有可显示的安全书签。</p>
  </div>
</template>
