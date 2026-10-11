<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Clock3, ExternalLink, History, Search } from '@lucide/vue'
import {
  canAccessBrowserHistory,
  hasBrowserHistoryPermission,
  requestBrowserHistoryPermission,
  searchBrowserHistory,
  subscribeToBrowserHistory,
  subscribeToBrowserHistoryPermissionChanges,
  type BrowserHistoryEntry,
} from '../data/browserHistory'

const supported = canAccessBrowserHistory()
const permissionGranted = ref(false)
const loading = ref(false)
const requestingPermission = ref(false)
const error = ref('')
const query = ref('')
const entries = ref<BrowserHistoryEntry[]>([])
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let refreshSequence = 0
let permissionSequence = 0
let stopListening: (() => void) | undefined
let stopWatchingPermission: (() => void) | undefined

async function refreshHistory() {
  const sequence = ++refreshSequence
  loading.value = true
  error.value = ''
  try {
    const results = await searchBrowserHistory(query.value)
    if (sequence === refreshSequence) entries.value = results
  } catch {
    if (sequence === refreshSequence) error.value = '无法读取浏览历史，请检查权限后重试。'
  } finally {
    if (sequence === refreshSequence) loading.value = false
  }
}

function watchHistoryChanges() {
  if (!stopListening) stopListening = subscribeToBrowserHistory(() => { void refreshHistory() })
}

async function syncPermission() {
  const sequence = ++permissionSequence
  try {
    const granted = await hasBrowserHistoryPermission()
    if (sequence !== permissionSequence) return
    permissionGranted.value = granted
    if (granted) {
      watchHistoryChanges()
      await refreshHistory()
    } else {
      refreshSequence += 1
      stopListening?.()
      stopListening = undefined
      entries.value = []
      loading.value = false
      error.value = ''
    }
  } catch {
    if (sequence === permissionSequence) error.value = '无法检查浏览历史权限。'
  }
}

async function enableHistory() {
  if (requestingPermission.value) return
  const sequence = ++permissionSequence
  requestingPermission.value = true
  error.value = ''
  try {
    const granted = await requestBrowserHistoryPermission()
    if (sequence !== permissionSequence) return
    permissionGranted.value = granted
    if (granted) {
      watchHistoryChanges()
      await refreshHistory()
    } else {
      error.value = '未授予浏览历史权限。你仍可稍后在扩展设置中启用。'
    }
  } catch {
    if (sequence === permissionSequence) error.value = '无法请求浏览历史权限，请稍后重试。'
  } finally {
    requestingPermission.value = false
  }
}

watch(query, () => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    if (permissionGranted.value) void refreshHistory()
  }, 180)
})

function formatVisitTime(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  const today = new Date()
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
  return new Intl.DateTimeFormat('zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

onMounted(async () => {
  if (!supported) return
  stopWatchingPermission = subscribeToBrowserHistoryPermissionChanges(() => { void syncPermission() })
  await syncPermission()
})

onBeforeUnmount(() => {
  permissionSequence += 1
  refreshSequence += 1
  if (refreshTimer) clearTimeout(refreshTimer)
  stopListening?.()
  stopWatchingPermission?.()
})
</script>

<template>
  <div class="browser-history-content">
    <label v-if="permissionGranted" class="field-label history-search">搜索浏览历史
      <span><Search :size="15" /><input v-model="query" type="search" aria-label="搜索浏览历史" placeholder="输入标题或网址" /></span>
    </label>

    <div v-if="!supported" class="empty-state">
      <History :size="30" />
      <p>此功能需要浏览器扩展</p>
      <small>请在已安装的 Chrome 或 Edge 新标签页中查看浏览历史。</small>
    </div>
    <div v-else-if="!permissionGranted" class="history-permission">
      <History :size="30" />
      <p>连接当前浏览器的历史记录</p>
      <small>仅在你启用后读取浏览历史；只搜索和打开记录，不会删除或上传。</small>
      <button class="button-primary" type="button" :disabled="requestingPermission" @click="enableHistory">
        {{ requestingPermission ? '正在请求权限…' : '启用浏览历史' }}
      </button>
    </div>
    <div v-else-if="loading && !entries.length" class="empty-state"><p>正在读取浏览历史…</p></div>
    <p v-if="error" class="backup-error" role="alert">{{ error }}</p>
    <div v-if="permissionGranted && !loading && !entries.length && !error" class="empty-state">
      <Clock3 :size="27" />
      <p>{{ query ? '没有匹配的浏览记录' : '浏览器中还没有可显示的记录' }}</p>
    </div>
    <ul v-if="permissionGranted && entries.length" class="browser-history-list" aria-label="浏览历史记录">
      <li v-for="entry in entries" :key="entry.id">
        <a :href="entry.url" target="_blank" rel="noopener noreferrer">
          <span class="history-entry-copy"><strong>{{ entry.title || entry.url }}</strong><small>{{ entry.url }}</small></span>
          <time :datetime="new Date(entry.lastVisitTime).toISOString()">{{ formatVisitTime(entry.lastVisitTime) }}</time>
          <ExternalLink :size="13" />
        </a>
      </li>
    </ul>
  </div>
</template>
