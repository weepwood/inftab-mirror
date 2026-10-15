<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ExternalLink } from '@lucide/vue'
import { useOptionalBrowserResource } from '../composables/useOptionalBrowserResource'
import { canAccessMostVisitedSites, getMostVisitedSiteCandidates, type BrowserTabCandidate } from '../data/browserTabs'
import { hasMostVisitedSitesPermission, requestMostVisitedSitesPermission, subscribeToMostVisitedSitesPermissionChanges } from '../data/browserTabPermissions'

const {
  supported,
  permissionGranted,
  loading,
  error,
  data: sites,
  refresh,
  retry,
} = useOptionalBrowserResource<BrowserTabCandidate[]>({
  supported: canAccessMostVisitedSites(),
  initial: [],
  hasPermission: hasMostVisitedSitesPermission,
  subscribeToPermissionChanges: subscribeToMostVisitedSitesPermissionChanges,
  load: async () => (await getMostVisitedSiteCandidates()).slice(0, 5),
  permissionError: '无法检查浏览器常用网站权限。',
  resourceError: '无法读取浏览器常用网站，请检查扩展权限后重试。',
  changeDebounceMs: 250,
})

const requestingPermission = ref(false)
const permissionError = ref('')
let refreshTimer: number | undefined

async function enableMostVisitedSites() {
  if (requestingPermission.value) return
  requestingPermission.value = true
  permissionError.value = ''
  try {
    if (await requestMostVisitedSitesPermission()) await retry()
    else permissionError.value = '未授予常用网站权限。你仍可继续使用其他新标签页功能。'
  } catch {
    permissionError.value = '无法请求常用网站权限，请稍后重试。'
  } finally {
    requestingPermission.value = false
  }
}

function refreshIfVisible() {
  if (permissionGranted.value && document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  if (!supported) return
  refreshTimer = window.setInterval(refreshIfVisible, 120_000)
  window.addEventListener('focus', refreshIfVisible)
  document.addEventListener('visibilitychange', refreshIfVisible)
})
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
  window.removeEventListener('focus', refreshIfVisible)
  document.removeEventListener('visibilitychange', refreshIfVisible)
})
</script>

<template>
  <div class="top-sites-summary-widget" aria-label="浏览器常用网站" :aria-busy="loading">
    <p v-if="!supported" class="home-widget-empty">此功能需要浏览器扩展；可在扩展中查看说明。</p>
    <template v-else-if="!permissionGranted">
      <p class="home-widget-empty">启用后读取浏览器提供的常用网站；内容只在本机显示，不会上传。</p>
      <button class="top-sites-summary-enable" type="button" :disabled="requestingPermission" @click="enableMostVisitedSites">
        {{ requestingPermission ? '正在请求权限…' : '启用常用网站' }}
      </button>
      <p v-if="permissionError" class="home-widget-empty" role="status">{{ permissionError }}</p>
      <p v-if="error" class="home-widget-empty" role="alert">{{ error }}</p>
    </template>
    <p v-else-if="loading && !sites.length" class="home-widget-empty" role="status">正在读取常用网站…</p>
    <p v-else-if="error" class="home-widget-empty" role="alert">
      {{ error }} <button class="top-sites-summary-retry" type="button" @click="retry">重试</button>
    </p>
    <ul v-else-if="sites.length" class="top-sites-summary-list" aria-label="浏览器常用网站列表">
      <li v-for="site in sites" :key="site.id">
        <a :href="site.url" target="_blank" rel="noopener noreferrer" :title="site.url">
          <span class="top-sites-summary-copy"><strong>{{ site.title }}</strong><small>{{ site.hostname }}</small></span>
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </li>
    </ul>
    <p v-else class="home-widget-empty">浏览器暂未提供常用网站。</p>
  </div>
</template>
