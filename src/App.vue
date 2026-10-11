<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, House, Menu, X } from '@lucide/vue'
import SearchBar from './components/SearchBar.vue'
import ShortcutGrid from './components/ShortcutGrid.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TodoPanel from './components/TodoPanel.vue'
import NotesPanel from './components/NotesPanel.vue'
import WeatherPanel from './components/WeatherPanel.vue'
import { useLocalWorkspace } from './composables/useLocalWorkspace'
import { launcherItems } from './data/defaults'
import { buildSearchUrl } from './data/search'
import type { LauncherItem, Shortcut } from './types'

type Panel = 'settings' | 'todos' | 'notes' | 'weather' | null

const baseUrl = import.meta.env.BASE_URL
const {
  preferences,
  shortcuts,
  launcherOrder,
  todos,
  notes,
  activeNoteId,
  weatherCity,
  saveShortcut: saveShortcutData,
  removeShortcut: removeShortcutData,
  reorderLauncherItems: reorderLauncherOrder,
  addTodo,
  toggleTodo,
  updateTodo,
  removeTodo,
  clearCompletedTodos,
  addNote,
  updateNote,
  removeNote,
  updatePreferences,
  resetPreferences,
  createBackup,
  restoreBackup,
} = useLocalWorkspace()

const query = ref('')
const currentPage = ref(0)
const activePanel = ref<Panel>(null)
const backupExportError = ref('')
const shortcutDialog = ref(false)
const editingId = ref('')
const shortcutTitle = ref('')
const shortcutUrl = ref('https://')
const shortcutColor = ref('#3d82f6')
const shortcutMark = ref('')
const shortcutIcon = ref('')
const shortcutIconFile = ref<HTMLInputElement>()
const shortcutIconError = ref('')
const savingShortcut = ref(false)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const pageSize = computed(() => preferences.value.columns * preferences.value.rows)
let homeTouchStart: { x: number; y: number; pointerId: number } | undefined
let homeWheelLocked = false
const allLauncherItems = computed<LauncherItem[]>(() => {
  const items = [
    ...launcherItems.map((item) => item.id === 'todos'
      ? { ...item, icon: item.icon ? `${baseUrl}inftab-icons/${item.icon}` : undefined, badge: todos.value.filter((todo) => !todo.done).length || undefined }
      : { ...item, icon: item.icon ? `${baseUrl}inftab-icons/${item.icon}` : undefined }),
    ...shortcuts.value.map((shortcut) => ({
      id: shortcut.id,
      title: shortcut.title,
      color: shortcut.color,
      mark: shortcut.mark,
      icon: shortcut.icon
        ? (/^(https?:|data:|\/)/i.test(shortcut.icon) ? shortcut.icon : `${baseUrl}inftab-icons/${shortcut.icon}`)
        : undefined,
      shortcut,
    })),
  ]
  const order = new Map(launcherOrder.value.map((id, index) => [id, index]))
  return items.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
})
const pageCount = computed(() => Math.max(1, Math.ceil(allLauncherItems.value.length / pageSize.value)))
const pageDots = computed(() => Array.from({ length: pageCount.value }, (_, index) => index))
const compactRows = computed(() => Math.min(preferences.value.rows, Math.max(1, Math.ceil(allLauncherItems.value.length / preferences.value.columns))))
const fitMetrics = computed(() => {
  const { width, height } = viewport.value
  const mobile = width <= 780
  const smallMobile = width <= 480
  const compactHeight = height <= 680
  const veryShortHeight = height <= 560
  const rows = compactRows.value
  const topPadding = veryShortHeight ? 38 : compactHeight ? Math.min(64, Math.max(48, height * 0.09)) : smallMobile ? height * 0.18 : mobile ? height * 0.17 : Math.min(112, Math.max(72, height * 0.09))
  const searchVisible = preferences.value.showSearchBar
  const tabHeight = searchVisible && preferences.value.visibleSearchModes.length ? (veryShortHeight ? 26 : smallMobile ? 28 : 33) : 0
  const searchHeight = searchVisible ? Math.min(preferences.value.searchHeight, veryShortHeight ? 44 : mobile ? 48 : 100) : 0
  const configuredTopGap = searchVisible ? preferences.value.gridTopGap * (mobile && !compactHeight ? 0.68 : 1) : 0
  const gridTopGap = veryShortHeight ? Math.min(configuredTopGap, 16) : compactHeight ? Math.min(configuredTopGap, 28) : configuredTopGap
  const paginationHeight = pageCount.value > 1 ? (veryShortHeight ? 31 : compactHeight ? 37 : mobile ? 43 : 48) : 0
  const nameHeight = preferences.value.showNames ? (smallMobile ? 13 : 17) + 7 : 0
  const footerClearance = veryShortHeight ? 24 : 38
  const available = height - topPadding - tabHeight - searchHeight - gridTopGap - paginationHeight - footerClearance - rows * nameHeight
  const requestedGap = Math.min(preferences.value.gridGapY, smallMobile ? 20 : mobile ? 24 : preferences.value.gridGapY)
  const fittedGap = rows > 1 ? Math.min(requestedGap, Math.max(4, (available - rows * 32) / (rows - 1))) : requestedGap
  const fittedIcon = Math.max(28, Math.min(preferences.value.iconSize, (available - (rows - 1) * fittedGap) / rows))
  return { fittedGap, fittedIcon }
})
const panelTitle = computed(() => ({ settings: '设置', todos: '待办事项', notes: '笔记', weather: '天气' }[activePanel.value ?? 'settings']))
const backgroundStyle = computed(() => {
  const value = preferences.value.customWallpaper.trim() || preferences.value.wallpaper
  const backgroundImage = value.startsWith('linear-gradient') ? value : `url("${value.replaceAll('"', '%22')}")`
  return {
    backgroundImage,
    '--page-shade': String(preferences.value.shade),
    '--grid-columns': String(preferences.value.columns),
    '--shortcut-size': `${preferences.value.iconSize}px`,
    '--shortcut-radius': `${preferences.value.iconRadius}px`,
    '--search-width': `${preferences.value.searchWidth}px`,
    '--search-height': `${preferences.value.searchHeight}px`,
    '--grid-top-gap': `${preferences.value.gridTopGap}px`,
    '--shortcut-gap-x': `${preferences.value.gridGapX}px`,
    '--shortcut-gap-y': `${fitMetrics.value.fittedGap}px`,
    '--fit-icon-size': `${fitMetrics.value.fittedIcon}px`,
    '--page-transition-duration': `${preferences.value.pageTransitionMs}ms`,
    '--hover-glow-strength': String(preferences.value.hoverGlow / 100),
  }
})

watch(pageCount, (count) => { currentPage.value = Math.min(currentPage.value, count - 1) })

function submitSearch() {
  const destination = buildSearchUrl(preferences.value.engine, preferences.value.mode, query.value)
  if (destination) window.location.assign(destination)
}

function openItem(item: LauncherItem) {
  if (item.action === 'settings' || item.action === 'wallpaper') activePanel.value = 'settings'
  else if (item.action) activePanel.value = item.action
  else if (item.shortcut?.id === 'wallpapers') activePanel.value = 'settings'
  else if (item.shortcut) window.open(item.shortcut.url, '_blank', 'noopener,noreferrer')
}

function openShortcutDialog(item?: LauncherItem) {
  editingId.value = item?.shortcut?.id ?? ''
  shortcutTitle.value = item?.shortcut?.title ?? ''
  shortcutUrl.value = item?.shortcut?.url ?? 'https://'
  shortcutColor.value = item?.shortcut?.color ?? '#3d82f6'
  shortcutMark.value = item?.shortcut?.mark ?? ''
  shortcutIcon.value = item?.shortcut?.icon ?? ''
  shortcutIconError.value = ''
  if (shortcutIconFile.value) shortcutIconFile.value.value = ''
  shortcutDialog.value = true
}

async function imageBlobToDataUrl(blob: Blob) {
  if (!blob.type.startsWith('image/')) throw new Error('这个文件不是可用的图片。')
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, 192 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张图片。')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('图片压缩失败。')), 'image/webp', 0.84)
    })
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取压缩后的图片。'))
      reader.onerror = () => reject(new Error('无法读取压缩后的图片。'))
      reader.readAsDataURL(compressed)
    })
  } finally {
    bitmap.close()
  }
}

async function loadShortcutIconFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  shortcutIconError.value = ''
  if (file.size > 10 * 1024 * 1024) {
    shortcutIconError.value = '图片不能超过 10 MB。'
    return
  }
  try {
    shortcutIcon.value = await imageBlobToDataUrl(file)
  } catch (error) {
    shortcutIconError.value = error instanceof Error ? error.message : '无法处理这张图片。'
  }
}

async function saveShortcut() {
  if (savingShortcut.value) return
  const title = shortcutTitle.value.trim()
  let destination = shortcutUrl.value.trim()
  if (!title || !destination) return
  if (!/^https?:\/\//i.test(destination)) destination = `https://${destination}`
  let icon = shortcutIcon.value.trim()
  shortcutIconError.value = ''
  if (/^https?:\/\//i.test(icon)) {
    savingShortcut.value = true
    try {
      const response = await fetch(icon)
      if (!response.ok) throw new Error(`图标下载失败（HTTP ${response.status}）。`)
      icon = await imageBlobToDataUrl(await response.blob())
    } catch {
      shortcutIconError.value = '无法从这个网址读取图片（可能被跨域限制）。请上传本地图片后再保存。'
      savingShortcut.value = false
      return
    }
    savingShortcut.value = false
  }
  const next: Shortcut = {
    id: editingId.value || crypto.randomUUID(),
    title,
    url: destination,
    color: shortcutColor.value,
    mark: shortcutMark.value.trim() || title.slice(0, 2),
    icon: icon || undefined,
  }
  saveShortcutData(next)
  shortcutDialog.value = false
}

function removeShortcut(item: LauncherItem) {
  if (!item.shortcut) return
  removeShortcutData(item.shortcut.id)
}

function movePage(direction: number) {
  currentPage.value = (currentPage.value + direction + pageCount.value) % pageCount.value
}

function startHomeSwipe(event: PointerEvent) {
  if (event.pointerType !== 'touch' || (event.target instanceof Element && event.target.closest('.shortcut-cell'))) return
  homeTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
}

function finishHomeSwipe(event: PointerEvent) {
  if (!homeTouchStart || event.pointerId !== homeTouchStart.pointerId) return
  const deltaX = event.clientX - homeTouchStart.x
  const deltaY = event.clientY - homeTouchStart.y
  if (Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) movePage(deltaX < 0 ? 1 : -1)
  homeTouchStart = undefined
}

function handleHomeWheel(event: WheelEvent) {
  if (activePanel.value || shortcutDialog.value || homeWheelLocked) return
  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
  const delta = horizontal ? event.deltaX : event.deltaY
  if (Math.abs(delta) <= 24) return
  event.preventDefault()
  movePage(delta > 0 ? 1 : -1)
  homeWheelLocked = true
  setTimeout(() => { homeWheelLocked = false }, 450)
}

function reorderItems(sourceId: string, targetId: string) {
  reorderLauncherOrder(sourceId, targetId, allLauncherItems.value.map((item) => item.id))
}

function downloadBackup() {
  try {
    const contents = JSON.stringify(createBackup(), null, 2)
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `inftab-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    backupExportError.value = ''
  } catch (error) {
    backupExportError.value = error instanceof Error ? `导出失败：${error.message}` : '导出失败，请稍后重试。'
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    activePanel.value = null
    shortcutDialog.value = false
  }
  const target = event.target instanceof HTMLElement ? event.target : null
  const editingText = target?.matches('input, textarea, [contenteditable="true"]') ?? false
  if (event.key === 'ArrowRight' && !editingText && !shortcutDialog.value && !activePanel.value) movePage(1)
  if (event.key === 'ArrowLeft' && !editingText && !shortcutDialog.value && !activePanel.value) movePage(-1)
}

function updateViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateViewport)
})
</script>

<template>
  <main class="home" :style="backgroundStyle" @pointerdown="startHomeSwipe" @pointerup="finishHomeSwipe" @pointercancel="homeTouchStart = undefined" @wheel="handleHomeWheel">
    <div class="background-shade"></div>
    <header class="home-actions">
      <button type="button" class="round-action" aria-label="回到首页" @click="currentPage = 0"><House :size="19" /></button>
      <button type="button" class="round-action" aria-label="打开设置" @click="activePanel = 'settings'"><Menu :size="21" /></button>
    </header>

    <section class="home-content">
      <SearchBar
        v-if="preferences.showSearchBar"
        v-model="query"
        v-model:engine="preferences.engine"
        v-model:mode="preferences.mode"
        :visible-modes="preferences.visibleSearchModes"
        @search="submitSearch"
      />
      <ShortcutGrid
        :items="allLauncherItems"
        :columns="preferences.columns"
        :rows="preferences.rows"
        :icon-size="preferences.iconSize"
        :icon-radius="preferences.iconRadius"
        :show-names="preferences.showNames"
        :current-page="currentPage"
        @open="openItem"
        @edit="openShortcutDialog"
        @remove="removeShortcut"
        @reorder="reorderItems"
        @swipe="movePage"
      />
      <nav v-if="pageCount > 1" class="page-dots" aria-label="快捷入口页码">
        <button type="button" aria-label="上一页" class="page-arrow" @click="movePage(-1)"><ArrowLeft :size="15" /></button>
        <button v-for="page in pageDots" :key="page" type="button" :aria-label="`第${page + 1}页`" class="page-dot" :class="{ active: page === currentPage }" @click="currentPage = page"></button>
        <button type="button" aria-label="下一页" class="page-arrow next" @click="movePage(1)"><ArrowLeft :size="15" /></button>
      </nav>
    </section>

    <img class="windmill" :src="`${baseUrl}windmill.svg`" alt="" />
    <footer class="home-footer">渝ICP备15002199号-1</footer>

    <div v-if="activePanel" class="panel-backdrop" @click.self="activePanel = null">
      <aside class="side-panel" :class="{ 'notes-panel': activePanel === 'notes' }" aria-modal="true" role="dialog" :aria-label="panelTitle">
        <header class="panel-header">
          <button v-if="activePanel !== 'settings'" class="back-button" type="button" aria-label="返回设置" @click="activePanel = 'settings'"><ArrowLeft :size="19" /></button>
          <div><h2>{{ panelTitle }}</h2><p>{{ activePanel === 'settings' ? '按自己的习惯调整新标签页' : '内容会自动保存在本地' }}</p></div>
          <button class="panel-close" type="button" aria-label="关闭" @click="activePanel = null"><X :size="19" /></button>
        </header>
        <SettingsPanel v-if="activePanel === 'settings'" :preferences="preferences" :export-error="backupExportError" @update="updatePreferences" @reset="resetPreferences" @add-shortcut="openShortcutDialog()" @export-backup="downloadBackup" @import-backup="restoreBackup" />
        <TodoPanel v-else-if="activePanel === 'todos'" :items="todos" @add="addTodo" @toggle="toggleTodo" @update="updateTodo" @remove="removeTodo" @clear-completed="clearCompletedTodos" />
        <NotesPanel v-else-if="activePanel === 'notes'" :notes="notes" :active-id="activeNoteId" @add="addNote" @select="activeNoteId = $event" @update="updateNote" @remove="removeNote" />
        <WeatherPanel v-else-if="activePanel === 'weather'" :city="weatherCity" @update:city="weatherCity = $event" />
      </aside>
    </div>

    <div v-if="shortcutDialog" class="modal-backdrop" @click.self="shortcutDialog = false">
      <form class="shortcut-dialog" @submit.prevent="saveShortcut">
        <header><div><h2>{{ editingId ? '编辑快捷入口' : '添加快捷入口' }}</h2><p>名称和网址可以随时修改</p></div><button type="button" aria-label="关闭" @click="shortcutDialog = false"><X :size="19" /></button></header>
        <label>名称<input v-model="shortcutTitle" autofocus required maxlength="24" placeholder="例如：GitHub" /></label>
        <label>网址<input v-model="shortcutUrl" required placeholder="https://example.com" /></label>
        <div class="dialog-row">
          <label>图标文字<input v-model="shortcutMark" maxlength="5" placeholder="自动取名称" /></label>
          <label class="color-field">图标颜色<input v-model="shortcutColor" type="color" /></label>
        </div>
        <label>图标图片地址（可选）<input v-model="shortcutIcon" placeholder="素材文件名、图片网址或 Base64" @input="shortcutIconError = ''" /></label>
        <div class="icon-file-actions">
          <input ref="shortcutIconFile" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="loadShortcutIconFile" />
          <button class="button-secondary" type="button" @click="shortcutIconFile?.click()">上传本地图片</button>
          <span>图片会压缩为 Base64 保存在本机，离线可用</span>
        </div>
        <p v-if="shortcutIconError" class="backup-error" role="alert">{{ shortcutIconError }}</p>
        <footer><button class="button-secondary" type="button" @click="shortcutDialog = false">取消</button><button class="button-primary" type="submit" :disabled="savingShortcut">{{ savingShortcut ? '正在转存图标…' : '保存' }}</button></footer>
      </form>
    </div>
  </main>
</template>
