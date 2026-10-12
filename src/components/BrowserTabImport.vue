<script setup lang="ts">
import { ref } from 'vue'
import { requestBrowserTabsPermission } from '../data/browserTabPermissions'
import { getCurrentWindowTabCandidates, type BrowserTabCandidate } from '../data/browserTabs'

const emit = defineEmits<{ select: [candidate: BrowserTabCandidate] }>()
const candidates = ref<BrowserTabCandidate[]>([])
const selectedId = ref('')
const error = ref('')
const loading = ref(false)

async function loadOpenBrowserTabs() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  candidates.value = []
  selectedId.value = ''
  try {
    // Start the optional permission request in this click handler so Chrome
    // can associate it with the user's explicit action.
    const granted = await requestBrowserTabsPermission()
    if (!granted) {
      error.value = '未授予读取标签页权限，仍可手动填写网址。'
      return
    }
    candidates.value = await getCurrentWindowTabCandidates()
    selectedId.value = candidates.value[0]?.id ?? ''
    if (candidates.value.length === 0) error.value = '当前窗口没有可导入的网页标签页。'
  } catch {
    error.value = '读取标签页失败，请重试或手动填写网址。'
  } finally {
    loading.value = false
  }
}

function importSelectedTab() {
  const candidate = candidates.value.find((tab) => tab.id === selectedId.value)
  if (candidate) emit('select', candidate)
}
</script>

<template>
  <div class="browser-tab-import">
    <button class="button-secondary" type="button" :disabled="loading" @click="loadOpenBrowserTabs">{{ loading ? '正在读取标签页…' : '从打开的标签页导入' }}</button>
    <span>首次使用时申请权限，只读取当前窗口的网页标题和网址。</span>
    <label v-if="candidates.length">选择标签页<select v-model="selectedId"><option v-for="tab in candidates" :key="tab.id" :value="tab.id">{{ tab.title }} — {{ tab.hostname }}</option></select></label>
    <button v-if="candidates.length" class="button-secondary" type="button" :disabled="!selectedId" @click="importSelectedTab">填入名称和网址</button>
    <p v-if="error" class="backup-error" role="status" aria-live="polite">{{ error }}</p>
  </div>
</template>
