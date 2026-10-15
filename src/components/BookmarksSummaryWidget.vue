<script setup lang="ts">
import { Bookmark, ExternalLink } from '@lucide/vue'
import { canAccessBrowserBookmarks, getBrowserBookmarkTree, hasBrowserBookmarksPermission, subscribeToBrowserBookmarkPermissionChanges, subscribeToBrowserBookmarks } from '../data/browserBookmarks'
import { useOptionalBrowserResource } from '../composables/useOptionalBrowserResource'
import { previewBookmarks } from '../data/bookmarkPreview'

const { supported, permissionGranted, loading, error, data: items } = useOptionalBrowserResource<ReturnType<typeof previewBookmarks>>({
  supported: canAccessBrowserBookmarks(),
  initial: [],
  hasPermission: hasBrowserBookmarksPermission,
  subscribeToPermissionChanges: subscribeToBrowserBookmarkPermissionChanges,
  subscribeToChanges: subscribeToBrowserBookmarks,
  load: async () => previewBookmarks(await getBrowserBookmarkTree()),
  permissionError: '无法检查浏览器书签权限。',
  resourceError: '无法读取浏览器书签，请打开书签面板检查权限后重试。',
})
</script>

<template>
  <div class="bookmarks-summary-widget" aria-label="浏览器书签概览" :aria-busy="loading">
    <p v-if="!supported" class="home-widget-empty">此功能需要浏览器扩展；可在书签面板中查看说明。</p>
    <p v-else-if="!permissionGranted" class="home-widget-empty">打开书签面板并启用权限后，这里会显示书签。</p>
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
