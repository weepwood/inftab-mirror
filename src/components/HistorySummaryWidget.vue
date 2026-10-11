<script setup lang="ts">
import { Clock3, ExternalLink } from '@lucide/vue'
import {
  canAccessBrowserHistory,
  hasBrowserHistoryPermission,
  searchBrowserHistory,
  subscribeToBrowserHistory,
  subscribeToBrowserHistoryPermissionChanges,
  type BrowserHistoryEntry,
} from '../data/browserHistory'
import { useOptionalBrowserResource } from '../composables/useOptionalBrowserResource'

const { supported, permissionGranted, loading, error, data: entries, retry } = useOptionalBrowserResource<BrowserHistoryEntry[]>({
  supported: canAccessBrowserHistory(),
  initial: [],
  hasPermission: hasBrowserHistoryPermission,
  subscribeToPermissionChanges: subscribeToBrowserHistoryPermissionChanges,
  subscribeToChanges: subscribeToBrowserHistory,
  load: () => searchBrowserHistory('', 5),
  permissionError: '无法检查浏览历史权限。',
  resourceError: '无法读取浏览历史，请打开历史记录面板检查权限后重试。',
  changeDebounceMs: 250,
})

function formatVisitTime(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
  return new Intl.DateTimeFormat('zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric' }).format(date)
}
</script>

<template>
  <div class="history-summary-widget" aria-label="最近浏览记录" :aria-busy="loading">
    <p v-if="!supported" class="home-widget-empty">此功能需要浏览器扩展；可在浏览历史面板中查看说明。</p>
    <p v-else-if="!permissionGranted" class="home-widget-empty">打开浏览历史面板并启用权限后，这里会显示最近访问。</p>
    <p v-else-if="loading && !entries.length" class="home-widget-empty" role="status">正在读取最近访问…</p>
    <p v-else-if="error" class="home-widget-empty" role="alert">{{ error }} <button class="history-summary-retry" type="button" @click="retry">重试</button></p>
    <ul v-else-if="entries.length" class="history-summary-list" aria-label="最近访问的网页">
      <li v-for="entry in entries" :key="entry.id">
        <a :href="entry.url" target="_blank" rel="noopener noreferrer" :title="entry.url">
          <Clock3 :size="14" aria-hidden="true" />
          <span>{{ entry.title || entry.url }}</span>
          <time :datetime="new Date(entry.lastVisitTime).toISOString()">{{ formatVisitTime(entry.lastVisitTime) }}</time>
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </li>
    </ul>
    <p v-else class="home-widget-empty">浏览器中还没有可显示的记录。</p>
  </div>
</template>
