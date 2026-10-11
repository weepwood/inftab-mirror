<script setup lang="ts">
import { ref } from 'vue'
import { searchModes, wallpaperChoices } from '../data/defaults'
import { parseWorkspaceBackup, type WorkspaceBackup } from '../data/backup'
import type { Preferences, SearchMode } from '../types'

const props = defineProps<{ preferences: Preferences; exportError?: string }>()
const emit = defineEmits<{
  update: [value: Partial<Preferences>]
  reset: []
  addShortcut: []
  exportBackup: []
  importBackup: [backup: WorkspaceBackup, mode: 'merge' | 'replace']
}>()
const fileInput = ref<HTMLInputElement>()
const pendingBackup = ref<WorkspaceBackup>()
const importError = ref('')

function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  emit('update', { [key]: value } as Pick<Preferences, K>)
}

function toggleSearchMode(mode: SearchMode, enabled: boolean) {
  const visibleModes = new Set(props.preferences.visibleSearchModes)
  if (enabled) visibleModes.add(mode)
  else visibleModes.delete(mode)
  update('visibleSearchModes', [...visibleModes])
}

async function readBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
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
</script>

<template>
  <div class="settings-content">
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
          @click="update('wallpaper', choice.value); update('customWallpaper', '')"
        ><span>{{ choice.label }}</span></button>
      </div>
      <p class="wallpaper-note">图库图片保存在项目中，无需依赖外站加载。</p>
      <label class="field-label">自定义背景图片网址
        <input :value="preferences.customWallpaper" placeholder="https://example.com/wallpaper.jpg" @input="update('customWallpaper', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="range-label"><span>背景暗度</span><input type="range" min="0" max="0.65" step="0.05" :value="preferences.shade" @input="update('shade', Number(($event.target as HTMLInputElement).value))" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>搜索栏</h3><p>控制首页搜索栏的显示和尺寸</p></div></div>
      <label class="toggle-row"><span>显示搜索栏</span><input type="checkbox" :checked="preferences.showSearchBar" @change="update('showSearchBar', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="range-label"><span>搜索框宽度</span><strong>{{ preferences.searchWidth }} px</strong><input type="range" min="280" max="1000" step="10" :value="preferences.searchWidth" @input="update('searchWidth', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>搜索框高度</span><strong>{{ preferences.searchHeight }} px</strong><input type="range" min="36" max="100" step="2" :value="preferences.searchHeight" @input="update('searchHeight', Number(($event.target as HTMLInputElement).value))" /></label>
      <p class="settings-subheading">显示搜索类型</p>
      <label v-for="item in searchModes" :key="item.id" class="toggle-row"><span>{{ item.id }}</span><input type="checkbox" :checked="preferences.visibleSearchModes.includes(item.id)" @change="toggleSearchMode(item.id, ($event.target as HTMLInputElement).checked)" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>快捷入口</h3><p>调整图标网格外观</p></div></div>
      <button class="settings-add-shortcut" type="button" @click="emit('addShortcut')"><span>＋</span> 添加快捷入口</button>
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
      <label class="range-label"><span>翻页动画时长</span><strong>{{ preferences.pageTransitionMs }} ms</strong><input type="range" min="0" max="2000" step="40" :value="preferences.pageTransitionMs" @input="update('pageTransitionMs', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>悬停光晕强度</span><strong>{{ preferences.hoverGlow }}%</strong><input type="range" min="0" max="100" step="5" :value="preferences.hoverGlow" @input="update('hoverGlow', Number(($event.target as HTMLInputElement).value))" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>备份与迁移</h3><p>导出或恢复本机数据</p></div></div>
      <div class="backup-actions">
        <button class="button-secondary" type="button" @click="emit('exportBackup')">导出 JSON 备份</button>
        <button class="button-secondary" type="button" @click="fileInput?.click()">导入备份</button>
        <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="readBackup" />
      </div>
      <p v-if="importError" class="backup-error" role="alert">{{ importError }}</p>
      <p v-if="exportError" class="backup-error" role="alert">{{ exportError }}</p>
      <p class="backup-description">备份包含快捷入口、待办、笔记、天气城市和页面设置。</p>
    </section>
    <p class="local-hint">设置保存在这台设备的浏览器中。</p>

    <div v-if="pendingBackup" class="modal-backdrop backup-backdrop" @click.self="pendingBackup = undefined">
      <section class="shortcut-dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <header><div><h2 id="backup-title">恢复本地备份</h2><p>请先确认导入的数据</p></div><button type="button" aria-label="取消导入" @click="pendingBackup = undefined">×</button></header>
        <p class="backup-preview">备份时间：{{ pendingBackup.exportedAt ? new Date(pendingBackup.exportedAt).toLocaleString() : '未知' }}</p>
        <ul class="backup-counts">
          <li>{{ pendingBackup.shortcuts.length }} 个快捷入口</li>
          <li>{{ pendingBackup.todos.length }} 条待办</li>
          <li>{{ pendingBackup.notes.length }} 条笔记</li>
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
