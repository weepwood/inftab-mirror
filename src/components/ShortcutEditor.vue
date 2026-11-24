<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import SelectField from './SelectField.vue'
import { lazyPluginComponent } from '../plugins/asyncComponent'
import { createLocalId } from '../data/createId'
import { maxImageUploadBytes } from '../data/imageLimits'
import { truncateCodePoints } from '../data/text'
import { normalizeWebUrl } from '../data/urls'
import type { BrowserTabCandidate } from '../data/browserTabs'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import type { Shortcut } from '../types'

const props = defineProps<{
  shortcut?: Partial<Shortcut>
  initialWorkspaceId: string
  workspaces: HomeWorkspace[]
  limitReached?: boolean
  saveError?: string
}>()
const emit = defineEmits<{ save: [shortcut: Shortcut, workspaceId: string]; close: [] }>()
const BrowserTabImport = lazyPluginComponent(
  () => import('./BrowserTabImport.vue'),
  '正在加载标签页导入…',
  '标签页导入暂时无法加载，请重试。',
)
const canImportBrowserTabs = location.protocol === 'chrome-extension:'
const title = ref(props.shortcut?.title ?? '')
const url = ref(props.shortcut?.url ?? '')
const workspaceId = ref(props.initialWorkspaceId)
const color = ref(props.shortcut?.color ?? '#3d82f6')
const mark = ref(props.shortcut?.mark ?? '')
const icon = ref(props.shortcut?.icon ?? '')
const titleError = ref('')
const urlError = ref('')
const iconError = ref('')
const saving = ref(false)
const uploading = ref(false)
const previewFailed = ref(false)
const busy = computed(() => saving.value || uploading.value)
const titleInput = ref<HTMLInputElement>()
const urlInput = ref<HTMLInputElement>()
const iconInput = ref<HTMLInputElement>()
const iconFile = ref<HTMLInputElement>()
const appearance = ref<HTMLDetailsElement>()
const saveButton = ref<HTMLButtonElement>()
const formError = ref<HTMLElement>()
const previewMark = computed(() => mark.value.trim() || truncateCodePoints(title.value.trim(), 2) || 'Aa')
// Never request an image merely because someone typed/pasted a URL. Only inline
// images are previewed; remote downloading keeps the existing explicit-save path.
const previewIcon = computed(() => !previewFailed.value && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(icon.value.trim()) ? icon.value.trim() : undefined)
// Saves are single-flight; unmount invalidates them. Uploads can be replaced
// while processing, so they additionally need a per-request sequence.
let active = true
let uploadRequestId = 0

watch(icon, () => { previewFailed.value = false })
watch(() => props.workspaces, (workspaces) => {
  if (!workspaces.some((workspace) => workspace.id === workspaceId.value)) workspaceId.value = workspaces[0]?.id ?? 'default'
})
watch(() => props.saveError, () => nextTick(() => formError.value?.focus()))

onMounted(async () => {
  await nextTick()
  if (active && !window.matchMedia?.('(pointer: coarse)').matches) titleInput.value?.focus()
})
onBeforeUnmount(() => {
  active = false
  uploadRequestId += 1
})

function imageErrorMessage(error: unknown) {
  return error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : undefined
}

function guardComposition(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) event.preventDefault()
}

async function focusInvalidField(field: 'title' | 'url' | 'icon') {
  if (field === 'icon' && appearance.value) appearance.value.open = true
  await nextTick()
  if (!active) return
  const input = field === 'title' ? titleInput.value : field === 'url' ? urlInput.value : iconInput.value
  input?.focus()
}

function fillFromBrowserTab(tab: BrowserTabCandidate) {
  title.value = truncateCodePoints(tab.title, 80)
  url.value = tab.url
  titleError.value = ''
  urlError.value = ''
}

function handleIconInput() {
  uploadRequestId += 1
  uploading.value = false
  iconError.value = ''
}

function clearIcon() {
  handleIconInput()
  icon.value = ''
  iconInput.value?.focus()
}

async function loadIconFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const requestId = ++uploadRequestId
  uploading.value = false
  iconError.value = ''
  if (!file) return
  if (file.size > maxImageUploadBytes) {
    iconError.value = '图片不能超过 10 MB，请选择更小的图片。'
    return
  }
  uploading.value = true
  try {
    const { compressImageBlob } = await import('../data/images')
    if (!active || requestId !== uploadRequestId) return
    const result = await compressImageBlob(file, 192)
    if (!active || requestId !== uploadRequestId) return
    icon.value = result
  } catch (error) {
    if (!active || requestId !== uploadRequestId) return
    iconError.value = imageErrorMessage(error) ?? '无法处理这张图片，请换一张后重试。'
  } finally {
    if (active && requestId === uploadRequestId) uploading.value = false
  }
}

async function save() {
  if (busy.value || props.limitReached) return
  const cleanTitle = title.value.trim()
  const destination = normalizeWebUrl(url.value)
  titleError.value = cleanTitle ? '' : '请输入快捷入口名称，例如 GitHub。'
  urlError.value = destination ? '' : '请输入有效的 HTTP 或 HTTPS 网址，例如 https://example.com。'
  if (titleError.value || urlError.value) return focusInvalidField(titleError.value ? 'title' : 'url')
  const id = props.shortcut?.id ?? createLocalId()
  const destinationWorkspaceId = workspaceId.value
  const nextColor = color.value
  const nextMark = mark.value.trim() || truncateCodePoints(cleanTitle, 2)
  let nextIcon = icon.value.trim()
  iconError.value = ''
  if (/^(?:https?:)?\/\//i.test(nextIcon)) {
    const normalized = normalizeWebUrl(nextIcon)
    if (!normalized) {
      iconError.value = '请输入有效的 HTTP 或 HTTPS 图片网址，或上传本地图片。'
      return focusInvalidField('icon')
    }
    nextIcon = normalized
  }
  // Extension pages retain image URLs rather than requesting broad host access.
  if (/^https?:\/\//i.test(nextIcon) && !canImportBrowserTabs) {
    saveButton.value?.focus()
    saving.value = true
    try {
      const { fetchAndCompressImage } = await import('../data/images')
      if (!active) return
      nextIcon = await fetchAndCompressImage(nextIcon, 192)
    } catch (error) {
      if (!active) return
      iconError.value = `${imageErrorMessage(error) ?? '无法从这个网址读取图片（可能被跨域限制）。'}请上传本地图片后再保存。`
      saving.value = false
      return focusInvalidField('icon')
    }
    if (!active) return
    saving.value = false
  }
  if (!active) return
  emit('save', { id, title: cleanTitle, url: destination!, color: nextColor, mark: nextMark, icon: nextIcon || undefined, ...(props.shortcut?.tags ? { tags: props.shortcut.tags } : {}) }, destinationWorkspaceId)
}
</script>

<template>
  <form class="shortcut-editor-form" novalidate @submit.prevent="save" @keydown.enter="guardComposition">
    <div class="shortcut-editor-body">
      <p v-if="limitReached || saveError" ref="formError" class="shortcut-field-error shortcut-form-error" role="alert" tabindex="-1">{{ saveError || '最多只能保存 500 个快捷入口，可先删除不用的入口。' }}</p>
      <div class="shortcut-form-field">
        <label for="shortcut-name">名称</label>
        <input id="shortcut-name" ref="titleInput" v-model="title" name="shortcut-name" required maxlength="80" placeholder="例如：GitHub" :aria-invalid="titleError ? 'true' : undefined" :aria-describedby="titleError ? 'shortcut-name-error' : undefined" :disabled="saving" @input="titleError = ''" />
        <p v-if="titleError" id="shortcut-name-error" class="shortcut-field-error" role="alert">{{ titleError }}</p>
      </div>
      <div class="shortcut-form-field">
        <label for="shortcut-url">网址</label>
        <input id="shortcut-url" ref="urlInput" v-model="url" name="shortcut-url" type="url" inputmode="url" required maxlength="2048" autocomplete="off" autocapitalize="off" :spellcheck="false" placeholder="https://example.com" :aria-invalid="urlError ? 'true' : undefined" :aria-describedby="urlError ? 'shortcut-url-error shortcut-url-hint' : 'shortcut-url-hint'" :disabled="saving" @input="urlError = ''" />
        <p v-if="urlError" id="shortcut-url-error" class="shortcut-field-error" role="alert">{{ urlError }}</p>
        <p id="shortcut-url-hint" class="shortcut-field-hint">省略协议时会自动使用 HTTPS。</p>
      </div>
      <BrowserTabImport v-if="canImportBrowserTabs && !saving" @select="fillFromBrowserTab" />
      <div class="shortcut-form-field">
        <label for="shortcut-workspace">所属工作区</label>
        <SelectField id="shortcut-workspace" v-model="workspaceId" name="shortcut-workspace" :disabled="saving"><option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}</option></SelectField>
      </div>
      <details ref="appearance" class="shortcut-appearance">
        <summary>
          <span class="shortcut-icon-preview" :style="{ backgroundColor: color }" aria-hidden="true"><img v-if="previewIcon" :src="previewIcon" alt="" @error="previewFailed = true" /><span v-else>{{ previewMark }}</span></span>
          <span class="shortcut-appearance-heading"><strong>图标与外观</strong><span>自定义文字、颜色或图片 · 可选</span></span>
          <ChevronDown class="shortcut-appearance-chevron" :size="17" :stroke-width="1.8" aria-hidden="true" />
        </summary>
        <div class="shortcut-appearance-fields">
          <div class="dialog-row">
            <div class="shortcut-form-field"><label for="shortcut-mark">图标文字</label><input id="shortcut-mark" v-model="mark" name="shortcut-mark" maxlength="5" placeholder="自动取名称" :disabled="saving" /></div>
            <div class="shortcut-form-field color-field"><label for="shortcut-color">图标颜色</label><input id="shortcut-color" v-model="color" name="shortcut-color" type="color" :disabled="saving" /></div>
          </div>
          <p class="shortcut-field-hint">默认使用名称前两个字；图片会覆盖文字和配色。</p>
          <div class="shortcut-form-field">
            <label for="shortcut-icon">图标图片地址（可选）</label>
            <input id="shortcut-icon" ref="iconInput" v-model="icon" name="shortcut-icon" placeholder="素材文件名、图片网址或 Base64" autocapitalize="off" :spellcheck="false" :aria-invalid="iconError ? 'true' : undefined" :aria-describedby="iconError ? 'shortcut-icon-error shortcut-icon-hint' : 'shortcut-icon-hint'" :disabled="saving" @input="handleIconInput" />
            <p v-if="iconError" id="shortcut-icon-error" class="shortcut-field-error" role="alert">{{ iconError }}</p>
          </div>
          <div class="icon-file-actions">
            <input ref="iconFile" class="visually-hidden" type="file" tabindex="-1" aria-hidden="true" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="saving" @change="loadIconFile" />
            <button class="button-secondary" type="button" :disabled="saving" :aria-disabled="uploading ? 'true' : undefined" :aria-describedby="iconError ? 'shortcut-icon-error shortcut-icon-hint' : 'shortcut-icon-hint'" @click="!uploading && iconFile?.click()">{{ uploading ? '正在处理图片…' : '上传本地图片' }}</button>
            <button v-if="icon" class="text-button" type="button" :disabled="saving" @click="clearIcon">使用文字图标</button>
          </div>
          <p id="shortcut-icon-hint" class="shortcut-field-hint">支持 PNG、JPG、WebP、GIF，最大 10 MB。本地图片压缩后保存在本机。</p>
          <p v-if="/^(?:https?:)?\/\//i.test(icon.trim())" class="shortcut-field-hint">预览不会联网，图片网址仅在保存时使用。</p>
        </div>
      </details>
    </div>
    <footer class="shortcut-editor-footer">
      <p class="shortcut-editor-status" role="status">{{ saving ? '正在转存图标，请稍候…' : uploading ? '正在压缩图片，请稍候…' : '仅保存在本机' }}</p>
      <div class="shortcut-editor-actions"><button class="button-secondary" type="button" @click="emit('close')">取消</button><button ref="saveButton" class="button-primary" type="submit" :disabled="limitReached" :aria-disabled="busy ? 'true' : undefined" :aria-busy="busy ? 'true' : undefined">{{ saving ? '正在转存图标…' : uploading ? '正在处理图片…' : '保存' }}</button></div>
    </footer>
  </form>
</template>
