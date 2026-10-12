<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { launcherItems, searchModes, wallpaperChoices } from '../data/defaults'
import { parseWorkspaceBackup, type WorkspaceBackup } from '../data/backup'
import { compressImageBlob } from '../data/images'
import { maxImageUploadBytes, maxWallpaperDataUrlLength } from '../data/imageLimits'
import { isValidCustomSearchTemplate } from '../data/search'
import { availableHomeWidgetIds, maxDockItems, type CustomSearchEngine, type HomeWidgetId, type PageTransitionEffect, type Preferences, type SearchMode, type ThemeMode, type WallpaperRotation } from '../types'
import { homeWidgetPlugins } from '../plugins/widgetRegistry'

const props = withDefaults(defineProps<{ preferences: Preferences; exportError?: string; customEngines?: CustomSearchEngine[] }>(), { customEngines: () => [] })
const transitionEffects: { id: PageTransitionEffect; label: string }[] = [
  { id: 'particles', label: '微粒消散' },
  { id: 'trails', label: '光迹拖尾' },
  { id: 'slide', label: '平滑滑动' },
]
const emit = defineEmits<{
  update: [value: Partial<Preferences>]
  reset: []
  addShortcut: []
  addFolder: []
  exportBackup: []
  importBackup: [backup: WorkspaceBackup, mode: 'merge' | 'replace']
  addSearchEngine: [name: string, template: string]
  removeSearchEngine: [id: string]
}>()
const fileInput = ref<HTMLInputElement>()
const wallpaperFileInput = ref<HTMLInputElement>()
const wallpaperError = ref('')
const importButton = ref<HTMLButtonElement>()
const backupDialog = ref<HTMLElement>()
const pendingBackup = ref<WorkspaceBackup>()
const importError = ref('')
const hasLocalWallpaper = computed(() => props.preferences.customWallpaper.startsWith('data:image/'))
const searchEngineName = ref('')
const searchEngineTemplate = ref('')
const searchEngineError = ref('')
const manageableLauncherItems = launcherItems.filter((item) => item.action && item.id !== 'settings')

watch(pendingBackup, async (backup, previous) => {
  if (backup) {
    await nextTick()
    backupDialog.value?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  } else if (previous) {
    await nextTick()
    importButton.value?.focus()
  }
})

function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  emit('update', { [key]: value } as Pick<Preferences, K>)
}

function toggleSearchMode(mode: SearchMode, enabled: boolean) {
  const visibleModes = new Set(props.preferences.visibleSearchModes)
  if (enabled) visibleModes.add(mode)
  else visibleModes.delete(mode)
  update('visibleSearchModes', [...visibleModes])
  if (!visibleModes.has(props.preferences.mode)) {
    update('mode', [...visibleModes][0] ?? 'html')
  }
}

function toggleLauncher(id: string, enabled: boolean) {
  const hidden = new Set(props.preferences.hiddenLauncherIds)
  if (enabled) hidden.delete(id)
  else hidden.add(id)
  update('hiddenLauncherIds', [...hidden])
}

function toggleHomeWidget(id: HomeWidgetId, enabled: boolean) {
  const widgets = props.preferences.homeWidgetIds.filter((widgetId) => widgetId !== id)
  if (enabled) widgets.push(id)
  update('homeWidgetIds', widgets)
}

function toggleDockItem(id: string, enabled: boolean) {
  const items = props.preferences.dockItemIds.filter((itemId) => itemId !== id)
  if (enabled) items.push(id)
  update('dockItemIds', items)
}

function setTransitionEffect(effect: PageTransitionEffect) {
  update('pageTransitionEffect', effect)
}

function setWallpaper(choice: string) {
  update('wallpaper', choice)
  update('customWallpaper', '')
  update('wallpaperRotationLastAt', Date.now())
}

function setWallpaperRotation(mode: WallpaperRotation) {
  update('wallpaperRotation', mode)
  update('wallpaperRotationLastAt', Date.now())
}

function setCustomWallpaper(value: string) {
  update('customWallpaper', value)
  update('wallpaperRotationLastAt', Date.now())
}

function addSearchEngine() {
  const name = searchEngineName.value.trim()
  const template = searchEngineTemplate.value.trim()
  if (!name) {
    searchEngineError.value = '请填写搜索引擎名称。'
    return
  }
  if (!isValidCustomSearchTemplate(template)) {
    searchEngineError.value = '请输入 HTTPS 搜索网址，并在查询位置使用 {query}。'
    return
  }
  if (props.customEngines.length >= 20) {
    searchEngineError.value = '最多可以添加 20 个自定义搜索引擎。'
    return
  }
  emit('addSearchEngine', name, template)
  searchEngineName.value = ''
  searchEngineTemplate.value = ''
  searchEngineError.value = ''
}

async function loadWallpaperFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  wallpaperError.value = ''
  if (file.size > maxImageUploadBytes) {
    wallpaperError.value = '图片不能超过 10 MB。'
    return
  }
  try {
    const dataUrl = await compressImageBlob(file, 1920, 1_400_000)
    if (dataUrl.length > maxWallpaperDataUrlLength) throw new Error('压缩后的图片仍然过大，请换一张内容更简单的图片。')
    setCustomWallpaper(dataUrl)
  } catch (error) {
    wallpaperError.value = error instanceof Error ? error.message : '无法处理这张图片。'
  }
}

async function readBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    pendingBackup.value = undefined
    importError.value = '备份文件不能超过 10 MB。'
    return
  }
  try {
    pendingBackup.value = parseWorkspaceBackup(JSON.parse(await file.text()))
    importError.value = ''
  } catch (error) {
    pendingBackup.value = undefined
    importError.value = error instanceof Error ? error.message : '无法读取此备份文件。'
  }
}

function applyImport(mode: 'merge' | 'replace') {
  if (!pendingBackup.value) return
  emit('importBackup', pendingBackup.value, mode)
  pendingBackup.value = undefined
}

function handleBackupDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    pendingBackup.value = undefined
    return
  }
  if (event.key !== 'Tab' || !backupDialog.value) return
  const focusable = [...backupDialog.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) {
    event.preventDefault()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="settings-content">
    <section class="settings-section">
      <div class="section-heading"><div><h3>界面与主题</h3><p>选择外观并设置首页信息</p></div></div>
      <label class="toggle-row">颜色主题
        <select aria-label="颜色主题" :value="preferences.themeMode" @change="update('themeMode', ($event.target as HTMLSelectElement).value as ThemeMode)">
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </label>
      <label class="toggle-row"><span>显示时间和日期</span><input type="checkbox" :checked="preferences.showClock" @change="update('showClock', ($event.target as HTMLInputElement).checked)" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading">
        <div><h3>背景图库</h3><p>选择归档壁纸或本地背景主题</p></div>
        <button class="text-button" type="button" @click="$emit('reset')">恢复默认</button>
      </div>
      <div class="wallpaper-options">
        <button
          v-for="choice in wallpaperChoices"
          :key="choice.value"
          class="wallpaper-option"
          :class="{ selected: preferences.wallpaper === choice.value }"
          :style="{ background: choice.preview }"
          type="button"
          :aria-label="choice.label"
          @click="setWallpaper(choice.value)"
        ><span>{{ choice.label }}</span></button>
      </div>
      <p class="wallpaper-note">图库图片保存在项目中，无需依赖外站加载。</p>
      <label class="toggle-row">定时轮换内置壁纸
        <select aria-label="壁纸轮换" :value="preferences.wallpaperRotation" @change="setWallpaperRotation(($event.target as HTMLSelectElement).value as WallpaperRotation)">
          <option value="off">关闭</option>
          <option value="hourly">每小时</option>
          <option value="daily">每天</option>
        </select>
      </label>
      <p class="wallpaper-note">轮换顺序与图库一致；使用自定义背景期间会暂停，移除后重新计时。</p>
      <label class="field-label">自定义背景图片网址
        <input :value="hasLocalWallpaper ? '' : preferences.customWallpaper" placeholder="https://example.com/wallpaper.jpg" @input="setCustomWallpaper(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="backup-actions wallpaper-upload-actions">
        <input ref="wallpaperFileInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="loadWallpaperFile" />
        <button class="button-secondary" type="button" @click="wallpaperFileInput?.click()">上传本地壁纸</button>
        <button v-if="hasLocalWallpaper" class="button-secondary" type="button" @click="setCustomWallpaper('')">移除本地壁纸</button>
      </div>
      <p v-if="hasLocalWallpaper" class="wallpaper-note">本地壁纸已压缩并离线保存在此浏览器中。</p>
      <p v-if="wallpaperError" class="backup-error" role="alert">{{ wallpaperError }}</p>
      <label class="range-label"><span>背景暗度</span><input type="range" min="0" max="0.65" step="0.05" :value="preferences.shade" @input="update('shade', Number(($event.target as HTMLInputElement).value))" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>搜索栏</h3><p>控制首页搜索栏的显示和尺寸</p></div></div>
      <label class="toggle-row"><span>显示搜索栏</span><input type="checkbox" :checked="preferences.showSearchBar" @change="update('showSearchBar', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="range-label"><span>搜索框宽度</span><strong>{{ preferences.searchWidth }} px</strong><input type="range" min="280" max="1000" step="10" :value="preferences.searchWidth" @input="update('searchWidth', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>搜索框高度</span><strong>{{ preferences.searchHeight }} px</strong><input type="range" min="36" max="100" step="2" :value="preferences.searchHeight" @input="update('searchHeight', Number(($event.target as HTMLInputElement).value))" /></label>
      <p class="settings-subheading">显示搜索类型</p>
      <label v-for="item in searchModes" :key="item.id" class="toggle-row"><span>{{ item.label }}</span><input type="checkbox" :checked="preferences.visibleSearchModes.includes(item.id)" @change="toggleSearchMode(item.id, ($event.target as HTMLInputElement).checked)" /></label>
      <p class="settings-subheading">自定义搜索引擎（最多 20 个）</p>
      <form class="custom-engine-form" @submit.prevent="addSearchEngine">
        <label class="field-label">名称<input v-model="searchEngineName" maxlength="40" placeholder="例如：维基百科" @input="searchEngineError = ''" /></label>
        <label class="field-label">搜索网址模板<input v-model="searchEngineTemplate" maxlength="500" placeholder="https://example.com/search?q={query}" @input="searchEngineError = ''" /></label>
        <p class="wallpaper-note">必须使用 HTTPS，并用 {query} 标记搜索词的位置。</p>
        <p v-if="searchEngineError" class="backup-error" role="alert">{{ searchEngineError }}</p>
        <button class="button-secondary" type="submit" :disabled="customEngines.length >= 20">添加搜索引擎</button>
      </form>
      <ul v-if="customEngines.length" class="custom-engine-list" aria-label="自定义搜索引擎">
        <li v-for="engine in customEngines" :key="engine.id"><span>{{ engine.name }}</span><button class="text-button" type="button" :aria-label="'删除搜索引擎' + engine.name" @click="emit('removeSearchEngine', engine.id)">删除</button></li>
      </ul>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>快捷入口</h3><p>调整图标网格外观</p></div></div>
      <p class="settings-subheading">首页小组件</p>
      <label v-for="id in availableHomeWidgetIds" :key="id" class="toggle-row">
        <span>{{ homeWidgetPlugins[id].title }}小组件</span><input type="checkbox" :aria-label="`显示${homeWidgetPlugins[id].title}小组件`" :checked="preferences.homeWidgetIds.includes(id)" @change="toggleHomeWidget(id, ($event.target as HTMLInputElement).checked)" />
      </label>
      <p class="wallpaper-note">小组件会保存在本机设置中，可在首页拖动排序，也可用上下按钮调整。</p>
      <p class="settings-subheading">常驻 Dock</p>
      <label v-for="item in manageableLauncherItems" :key="`dock-${item.id}`" class="toggle-row">
        <span>固定{{ item.title }}到 Dock</span><input type="checkbox" :checked="preferences.dockItemIds.includes(item.id)" :disabled="!preferences.dockItemIds.includes(item.id) && preferences.dockItemIds.length >= maxDockItems" @change="toggleDockItem(item.id, ($event.target as HTMLInputElement).checked)" />
      </label>
      <p class="wallpaper-note">Dock 会固定显示在页面底部，翻页后也可直接打开。</p>
      <p class="settings-subheading">内置面板</p>
      <label v-for="item in manageableLauncherItems" :key="item.id" class="toggle-row">
        <span>显示{{ item.title }}</span><input type="checkbox" :checked="!preferences.hiddenLauncherIds.includes(item.id)" @change="toggleLauncher(item.id, ($event.target as HTMLInputElement).checked)" />
      </label>
      <p class="wallpaper-note">设置入口始终保留，可随时恢复已隐藏的面板。</p>
      <button class="settings-add-shortcut" type="button" @click="emit('addShortcut')"><span>＋</span> 添加快捷入口</button>
      <button class="settings-add-shortcut folder-add-button" type="button" @click="emit('addFolder')"><span>▣</span> 新建文件夹</button>
      <label class="range-label"><span>每行图标</span><strong>{{ preferences.columns }}</strong><input type="range" min="2" max="12" step="1" :value="preferences.columns" @input="update('columns', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>每页行数</span><strong>{{ preferences.rows }}</strong><input type="range" min="1" max="8" step="1" :value="preferences.rows" @input="update('rows', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>图标大小</span><strong>{{ preferences.iconSize }} px</strong><input type="range" min="32" max="160" step="2" :value="preferences.iconSize" @input="update('iconSize', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>圆角</span><strong>{{ preferences.iconRadius }} px</strong><input type="range" min="0" max="100" step="2" :value="preferences.iconRadius" @input="update('iconRadius', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>图标横向间距</span><strong>{{ preferences.gridGapX }} px</strong><input type="range" min="0" max="80" step="2" :value="preferences.gridGapX" @input="update('gridGapX', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>图标纵向间距</span><strong>{{ preferences.gridGapY }} px</strong><input type="range" min="0" max="100" step="2" :value="preferences.gridGapY" @input="update('gridGapY', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>搜索栏与图标间距</span><strong>{{ preferences.gridTopGap }} px</strong><input type="range" min="0" max="180" step="2" :value="preferences.gridTopGap" @input="update('gridTopGap', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="toggle-row"><span>显示网站名称</span><input type="checkbox" :checked="preferences.showNames" @change="update('showNames', ($event.target as HTMLInputElement).checked)" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>动画与反馈</h3><p>控制翻页速度和图标悬停效果</p></div></div>
      <p class="settings-subheading">翻页效果</p>
      <label v-for="effect in transitionEffects" :key="effect.id" class="toggle-row transition-option">
        <span>{{ effect.label }}</span><input type="radio" name="page-transition-effect" :checked="preferences.pageTransitionEffect === effect.id" @change="setTransitionEffect(effect.id)" />
      </label>
      <label class="range-label"><span>翻页动画时长</span><strong>{{ preferences.pageTransitionMs }} ms</strong><input type="range" min="0" max="2000" step="40" :value="preferences.pageTransitionMs" @input="update('pageTransitionMs', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>悬停光晕强度</span><strong>{{ preferences.hoverGlow }}%</strong><input type="range" min="0" max="100" step="5" :value="preferences.hoverGlow" @input="update('hoverGlow', Number(($event.target as HTMLInputElement).value))" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>备份与迁移</h3><p>导出或恢复本机数据</p></div></div>
      <div class="backup-actions">
        <button class="button-secondary" type="button" @click="emit('exportBackup')">导出 JSON 备份</button>
        <button ref="importButton" class="button-secondary import-backup-button" type="button" @click="fileInput?.click()">导入备份</button>
        <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="readBackup" />
      </div>
      <p v-if="importError" class="backup-error" role="alert">{{ importError }}</p>
      <p v-if="exportError" class="backup-error" role="alert">{{ exportError }}</p>
      <p class="backup-description">备份包含快捷入口、文件夹、主页工作区、待办、习惯、纪念日、笔记、自定义搜索引擎、专注计时状态和页面设置；浏览器书签与历史不包含在内。</p>
    </section>
    <p class="local-hint">设置保存在这台设备的浏览器中。</p>

    <div v-if="pendingBackup" class="modal-backdrop backup-backdrop" @click.self="pendingBackup = undefined">
      <section ref="backupDialog" class="shortcut-dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title" @keydown="handleBackupDialogKeydown">
        <header><div><h2 id="backup-title">恢复本地备份</h2><p>请先确认导入的数据</p></div><button type="button" aria-label="取消导入" @click="pendingBackup = undefined">×</button></header>
        <p class="backup-preview">备份时间：{{ pendingBackup.exportedAt ? new Date(pendingBackup.exportedAt).toLocaleString() : '未知' }}</p>
        <ul class="backup-counts">
          <li>{{ pendingBackup.shortcuts.length }} 个快捷入口</li>
          <li>{{ pendingBackup.folders.length }} 个文件夹</li>
          <li>{{ pendingBackup.homeWorkspaces?.length ?? 1 }} 个主页工作区</li>
          <li>{{ pendingBackup.todos.length }} 条待办</li>
          <li>{{ pendingBackup.habits?.length ?? 0 }} 个习惯</li>
          <li>{{ pendingBackup.countdowns.length }} 个纪念日</li>
          <li>{{ pendingBackup.notes.length }} 条笔记</li>
          <li>{{ pendingBackup.customSearchEngines?.length ?? 0 }} 个自定义搜索引擎</li>
          <li v-if="pendingBackup.focusTimer">包含专注计时状态</li>
        </ul>
        <p class="backup-warning">覆盖会替换当前浏览器中的数据；合并会保留现有项目并按 ID 更新重合内容。</p>
        <footer>
          <button class="button-secondary" type="button" @click="pendingBackup = undefined">取消</button>
          <button class="button-secondary" type="button" @click="applyImport('merge')">合并导入</button>
          <button class="button-primary" type="button" @click="applyImport('replace')">覆盖导入</button>
        </footer>
      </section>
    </div>
  </div>
</template>
