<script setup lang="ts">
import { ref } from 'vue'
import { requestBrowserTabsPermission, requestMostVisitedSitesPermission } from '../data/browserTabPermissions'
import { getCurrentWindowTabCandidates, getMostVisitedSiteCandidates, type BrowserTabCandidate } from '../data/browserTabs'

const emit = defineEmits<{ select: [candidate: BrowserTabCandidate] }>()
const candidates = ref<BrowserTabCandidate[]>([])
const selectedId = ref('')
const error = ref('')
const loading = ref(false)

async function loadCandidates(
  requestPermission: () => Promise<boolean>,
  load: () => Promise<BrowserTabCandidate[]>,
  deniedMessage: string,
  emptyMessage: string,
) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  candidates.value = []
  selectedId.value = ''
  try {
    // Start the optional permission request in this click handler so Chrome
    // can associate it with the user's explicit action.
    const granted = await requestPermission()
    if (!granted) {
      error.value = deniedMessage
      return
    }
    candidates.value = await load()
    selectedId.value = candidates.value[0]?.id ?? ''
    if (candidates.value.length === 0) error.value = emptyMessage
  } catch {
    error.value = '读取浏览器网站失败，请重试或手动填写网址。'
  } finally {
    loading.value = false
  }
}

function loadOpenBrowserTabs() {
  return loadCandidates(
    requestBrowserTabsPermission,
    getCurrentWindowTabCandidates,
    '未授予读取标签页权限，仍可手动填写网址。',
    '当前窗口没有可导入的网页标签页。',
  )
}

function loadMostVisitedSites() {
  return loadCandidates(
    requestMostVisitedSitesPermission,
    getMostVisitedSiteCandidates,
    '未授予读取常用网站权限，仍可手动填写网址。',
    '浏览器没有可导入的常用网站。',
  )
}

function importSelectedTab() {
  const candidate = candidates.value.find((tab) => tab.id === selectedId.value)
  if (candidate) emit('select', candidate)
}
</script>

<template>
  <div class="browser-tab-import">
    <div class="browser-tab-import-actions">
      <button class="button-secondary" type="button" :disabled="loading" @click="loadOpenBrowserTabs">{{ loading ? '正在读取…' : '从打开的标签页导入' }}</button>
      <button class="button-secondary" type="button" :disabled="loading" @click="loadMostVisitedSites">{{ loading ? '正在读取…' : '从常用网站导入' }}</button>
    </div>
    <span>首次使用时按所选来源申请权限，只读取网页名称和网址；也可直接手动填写。</span>
    <label v-if="candidates.length">选择标签页<select v-model="selectedId"><option v-for="tab in candidates" :key="tab.id" :value="tab.id">{{ tab.title }} — {{ tab.hostname }}</option></select></label>
    <button v-if="candidates.length" class="button-secondary" type="button" :disabled="!selectedId" @click="importSelectedTab">填入名称和网址</button>
    <p v-if="error" class="backup-error" role="status" aria-live="polite">{{ error }}</p>
  </div>
</template>
