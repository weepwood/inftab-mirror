<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ExternalLink, RefreshCw } from '@lucide/vue'
import { fetchHackerNewsStories, hasHackerNewsPermission, readCachedHackerNewsFeed, requestHackerNewsPermission, subscribeToHackerNewsPermissionChanges, writeCachedHackerNewsFeed, type HackerNewsStory } from '../data/hackerNews'

const stories = ref<HackerNewsStory[]>([])
const loading = ref(false)
const requestingPermission = ref(false)
const permissionChecking = ref(true)
const permissionGranted = ref(false)
const lastUpdatedAt = ref(0)
const error = ref('')
let activeRequest: AbortController | undefined
let timeout: number | undefined
let isActive = false
let stopWatchingPermission: (() => void) | undefined
let permissionCheckSequence = 0

async function loadStories() {
  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  loading.value = true
  error.value = ''
  let timedOut = false
  const requestTimeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 10_000)
  timeout = requestTimeout
  try {
    const nextStories = await fetchHackerNewsStories(controller.signal)
    if (!isActive || activeRequest !== controller || controller.signal.aborted) return
    stories.value = nextStories
    lastUpdatedAt.value = Date.now()
    writeCachedHackerNewsFeed(stories.value, lastUpdatedAt.value)
  } catch (cause) {
    if (controller.signal.aborted && !timedOut) return
    error.value = timedOut
      ? '资讯请求超时，请检查网络后重试。'
      : cause instanceof Error ? cause.message : '资讯加载失败，请稍后重试。'
  } finally {
    window.clearTimeout(requestTimeout)
    if (timeout === requestTimeout) timeout = undefined
    if (activeRequest === controller) {
      activeRequest = undefined
      if (isActive) loading.value = false
    }
  }
}

async function refreshStories() {
  const sequence = ++permissionCheckSequence
  const previouslyGranted = permissionGranted.value
  let hasPermission = false
  try {
    hasPermission = await hasHackerNewsPermission()
  } catch {
    hasPermission = false
  }
  if (!isActive || sequence !== permissionCheckSequence) return
  permissionGranted.value = hasPermission
  permissionChecking.value = false
  if (!permissionGranted.value) {
    activeRequest?.abort()
    error.value = previouslyGranted
      ? '资讯访问权限已关闭，当前保留本地缓存。'
      : '资讯需要访问 Hacker News 数据服务的可选权限。'
    return
  }
  error.value = ''
  await loadStories()
}

async function authorizeAndLoad() {
  if (requestingPermission.value) return
  const sequence = ++permissionCheckSequence
  requestingPermission.value = true
  error.value = ''
  try {
    const granted = await requestHackerNewsPermission()
    if (!isActive || sequence !== permissionCheckSequence) return
    permissionGranted.value = granted
  } catch {
    if (isActive && sequence === permissionCheckSequence) permissionGranted.value = false
  } finally {
    if (isActive) requestingPermission.value = false
  }
  if (!isActive || sequence !== permissionCheckSequence) return
  if (!permissionGranted.value) {
    error.value = '未获得资讯访问权限；你仍可正常使用搜索和快捷入口。'
    return
  }
  await loadStories()
}

function refreshIfStale() {
  const now = Date.now()
  if (isActive && !loading.value && permissionGranted.value && document.visibilityState === 'visible'
    && (lastUpdatedAt.value > now || now - lastUpdatedAt.value >= 15 * 60 * 1000)) void refreshStories()
}

onMounted(async () => {
  isActive = true
  stopWatchingPermission = subscribeToHackerNewsPermissionChanges(() => { void refreshStories() })
  try {
    const cachedFeed = readCachedHackerNewsFeed()
    if (cachedFeed) {
      stories.value = cachedFeed.stories
      lastUpdatedAt.value = cachedFeed.updatedAt
    }
  } catch {
    // The live feed remains available when browser storage is blocked.
  }
  await refreshStories()
  if (!isActive) return
  window.addEventListener('focus', refreshIfStale)
  document.addEventListener('visibilitychange', refreshIfStale)
})

onBeforeUnmount(() => {
  isActive = false
  permissionCheckSequence += 1
  activeRequest?.abort()
  if (timeout !== undefined) window.clearTimeout(timeout)
  stopWatchingPermission?.()
  window.removeEventListener('focus', refreshIfStale)
  document.removeEventListener('visibilitychange', refreshIfStale)
})
</script>

<template>
  <div class="news-summary-widget" aria-label="Hacker News 热门资讯" :aria-busy="loading">
    <p class="news-summary-attribution"><a href="https://news.ycombinator.com/" target="_blank" rel="noopener noreferrer">资讯来源：Hacker News</a><span>仅在显示此组件时联网</span></p>
    <p v-if="permissionChecking" class="home-widget-empty" role="status">正在检查资讯权限…</p>
    <p v-else-if="!permissionGranted" class="home-widget-empty" role="status">在扩展中启用资讯需要单独授权网络访问。</p>
    <p v-else-if="loading && !stories.length" class="home-widget-empty" role="status">正在加载热门资讯…</p>
    <p v-if="loading && stories.length" class="news-summary-updated" role="status">正在更新资讯，显示的是上次缓存的内容。</p>
    <p v-if="error" class="news-summary-error" role="alert">{{ error }}</p>
    <p v-if="lastUpdatedAt && stories.length" class="news-summary-updated">最近更新：{{ new Date(lastUpdatedAt).toLocaleString() }}</p>
    <ul v-if="stories.length" class="news-summary-list" aria-label="Hacker News 热门故事">
      <li v-for="story in stories" :key="story.id">
        <a :href="story.url" target="_blank" rel="noopener noreferrer" :title="story.title">
          <span class="news-summary-copy"><strong>{{ story.title }}</strong><small>{{ story.source }} · {{ story.points }} 分 · {{ story.comments }} 条讨论</small></span>
          <ExternalLink :size="13" aria-hidden="true" />
        </a>
      </li>
    </ul>
    <p v-else-if="permissionGranted && !loading && !error" class="home-widget-empty">目前没有可显示的热门资讯。</p>
    <button v-if="!permissionChecking && !permissionGranted" class="news-summary-refresh" type="button" :disabled="requestingPermission" @click="authorizeAndLoad">{{ requestingPermission ? '正在请求授权…' : '授权并加载资讯' }}</button>
    <button v-else class="news-summary-refresh" type="button" :disabled="loading" @click="refreshStories">{{ loading ? '正在刷新…' : '刷新资讯' }}<RefreshCw :size="13" aria-hidden="true" /></button>
  </div>
</template>
