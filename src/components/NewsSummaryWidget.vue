<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ExternalLink, RefreshCw } from '@lucide/vue'
import { fetchHackerNewsStories, hasHackerNewsPermission, requestHackerNewsPermission, type HackerNewsStory } from '../data/hackerNews'

const stories = ref<HackerNewsStory[]>([])
const loading = ref(false)
const requestingPermission = ref(false)
const permissionChecking = ref(true)
const permissionGranted = ref(false)
const error = ref('')
let activeRequest: AbortController | undefined
let timeout: number | undefined
let lastUpdatedAt = 0
let isActive = false

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
    stories.value = await fetchHackerNewsStories(controller.signal)
    lastUpdatedAt = Date.now()
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
  try {
    permissionGranted.value = await hasHackerNewsPermission()
  } catch {
    permissionGranted.value = false
  }
  if (!isActive) return
  if (!permissionGranted.value) {
    error.value = '资讯需要访问 Hacker News 数据服务的可选权限。'
    return
  }
  await loadStories()
}

async function authorizeAndLoad() {
  if (requestingPermission.value) return
  requestingPermission.value = true
  error.value = ''
  try {
    const granted = await requestHackerNewsPermission()
    if (!isActive) return
    permissionGranted.value = granted
  } catch {
    if (isActive) permissionGranted.value = false
  } finally {
    if (isActive) requestingPermission.value = false
  }
  if (!isActive) return
  if (!permissionGranted.value) {
    error.value = '未获得资讯访问权限；你仍可正常使用搜索和快捷入口。'
    return
  }
  await loadStories()
}

function refreshIfStale() {
  if (isActive && !loading.value && permissionGranted.value && document.visibilityState === 'visible'
    && Date.now() - lastUpdatedAt >= 15 * 60 * 1000) void refreshStories()
}

onMounted(async () => {
  isActive = true
  let hasPermission = false
  try {
    hasPermission = await hasHackerNewsPermission()
  } catch {
    hasPermission = false
  }
  if (!isActive) return
  permissionChecking.value = false
  permissionGranted.value = hasPermission
  if (hasPermission) await loadStories()
  if (!isActive) return
  window.addEventListener('focus', refreshIfStale)
  document.addEventListener('visibilitychange', refreshIfStale)
})

onBeforeUnmount(() => {
  isActive = false
  activeRequest?.abort()
  if (timeout !== undefined) window.clearTimeout(timeout)
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
    <p v-if="error" class="news-summary-error" role="alert">{{ error }}</p>
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
