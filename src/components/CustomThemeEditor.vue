<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { CustomTheme } from '../types'
import { contrastRatio, defaultCustomTheme, sanitizeCustomTheme } from '../data/customTheme'
import { downloadThemeFile, maxThemeFileBytes, parseThemeFile } from '../data/themeExchange'

const props = defineProps<{ theme?: CustomTheme | null }>()
const emit = defineEmits<{ apply: [theme: CustomTheme | null] }>()
const clone = (theme: CustomTheme) => ({ ...theme, light: { ...theme.light }, dark: { ...theme.dark } })
const draft = ref(clone(props.theme ?? defaultCustomTheme))
const mode = ref<'light' | 'dark'>('light')
const status = ref('')
let readId = 0
const baseline = ref(JSON.stringify(props.theme ?? null))
const valid = computed(() => sanitizeCustomTheme(draft.value))
const colors = computed(() => draft.value[mode.value])
const contrast = computed(() => contrastRatio(colors.value.surface, colors.value.text))
const buttonContrast = computed(() => contrastRatio(colors.value.accent, '#ffffff'))
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.theme ?? defaultCustomTheme))
const conflict = computed(() => baseline.value !== JSON.stringify(props.theme ?? null))
function reload() {
  readId++
  baseline.value = JSON.stringify(props.theme ?? null)
  draft.value = clone(props.theme ?? defaultCustomTheme)
  status.value = ''
}
function apply() {
  if (baseline.value !== JSON.stringify(props.theme ?? null)) { status.value = '主题已在其他位置修改，请重新加载草稿。'; return }
  if (!valid.value) return
  baseline.value = JSON.stringify(valid.value)
  emit('apply', valid.value)
  status.value = '主题已应用。'
}
function disable() {
  if (baseline.value !== JSON.stringify(props.theme ?? null)) { status.value = '主题已发生变化，请重新加载。'; return }
  baseline.value = 'null'
  emit('apply', null)
  status.value = '已恢复内置配色。'
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const id = ++readId
  try {
    if (file.size > maxThemeFileBytes) throw new Error('主题文件超过 16 KiB。')
    const theme = parseThemeFile(await file.text())
    if (id !== readId) return
    draft.value = theme
    status.value = '已载入草稿，确认预览后应用。'
  } catch (error) { if (id === readId) status.value = error instanceof Error ? error.message : '读取失败。' }
}
function exportFile() {
  if (valid.value) downloadThemeFile(valid.value)
}
onBeforeUnmount(() => { readId++ })
</script>

<template>
  <div class="custom-theme-editor">
    <div class="theme-actions" role="group" aria-label="预览模式"><button type="button" :aria-pressed="mode === 'light'" @click="mode = 'light'">浅色预览</button><button type="button" :aria-pressed="mode === 'dark'" @click="mode = 'dark'">深色预览</button></div>
    <div class="theme-preview" :style="{ '--preview-accent': colors.accent, '--preview-surface': colors.surface, '--preview-text': colors.text, '--preview-radius': draft.radius + 'px', '--preview-opacity': draft.opacity / 100 }" aria-label="主题草稿预览">
      <div class="theme-preview-card"><strong>工作台预览</strong><span>搜索、快捷入口和小组件</span><div class="theme-preview-field">搜索网站或输入网址</div><span class="theme-preview-button">主要操作</span></div>
    </div>
    <div class="theme-colors">
      <label><span>强调色 <small>{{ colors.accent }}</small></span><input v-model="colors.accent" type="color" :aria-label="mode === 'light' ? '浅色强调色' : '深色强调色'" /></label>
      <label><span>面板背景 <small>{{ colors.surface }}</small></span><input v-model="colors.surface" type="color" :aria-label="mode === 'light' ? '浅色面板背景' : '深色面板背景'" /></label>
      <label><span>正文颜色 <small>{{ colors.text }}</small></span><input v-model="colors.text" type="color" :aria-label="mode === 'light' ? '浅色正文颜色' : '深色正文颜色'" /></label>
    </div>
    <label class="theme-range">控件圆角 <output>{{ draft.radius }} px</output><input v-model.number="draft.radius" aria-label="控件圆角" type="range" min="0" max="24" /></label>
    <label class="theme-range">玻璃表面不透明度 <output>{{ draft.opacity }}%</output><input v-model.number="draft.opacity" aria-label="玻璃表面不透明度" type="range" min="85" max="100" /></label>
    <p>当前模式文字对比度 {{ contrast.toFixed(2) }}:1，强调色与白字 {{ buttonContrast.toFixed(2) }}:1。两套配色均需达到 4.5:1（纯色检查，不保证全部透明背景场景）。</p>
    <p v-if="!valid" role="alert">两套配色中存在不满足对比度或范围要求的设置，暂不可应用或导出。</p>
    <p v-if="conflict" role="alert">主题已在其他位置修改，请重新加载草稿。</p>
    <div class="theme-actions"><button type="button" :disabled="!valid || conflict" @click="apply">应用自定义主题</button><button type="button" @click="reload">取消草稿并重载</button><button v-if="theme" type="button" :disabled="conflict" @click="disable">恢复内置配色</button></div>
    <label class="theme-file">导入主题 JSON<input type="file" accept=".json,application/json" @change="importFile" /></label>
    <div class="theme-actions"><button type="button" :disabled="!valid" @click="exportFile">导出主题草稿</button><span v-if="changed">草稿未保存</span></div>
    <p v-if="status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.custom-theme-editor { display: grid; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--ui-text); }
.theme-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.theme-actions button { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-control); background: var(--ui-field); color: var(--ui-text); min-height: 34px; padding: 5px 9px; cursor: pointer; }
.theme-actions button[aria-pressed=true] { background: var(--ui-accent-soft); color: var(--ui-accent-text); }
.theme-actions button:disabled { opacity: .5; cursor: not-allowed; }
.theme-preview { padding: 12px; border-radius: 14px; background: linear-gradient(140deg,#72877c,#bac3cf); }
.theme-preview-card { display: grid; gap: 8px; padding: 14px; color: var(--preview-text); border-radius: calc(var(--preview-radius) + 8px); background: var(--preview-surface); }
@supports (color: color-mix(in srgb, black, white)) { .theme-preview-card { background: color-mix(in srgb, var(--preview-surface) calc(var(--preview-opacity) * 100%), transparent); } }
.theme-preview-card strong { font-size: 16px; }
.theme-preview-field { padding: 9px; border-radius: var(--preview-radius); border: 1px solid currentColor; }
.theme-preview-button { justify-self: start; padding: 7px 10px; border-radius: var(--preview-radius); background: var(--preview-accent); color: white; }
.theme-colors { display: grid; gap: 7px; }
.theme-colors label, .theme-range { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.theme-colors small { color: var(--ui-muted); font-family: monospace; }
.theme-colors input { width: 46px; height: 32px; padding: 2px; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-field); }
.theme-range input { width: 100%; accent-color: var(--ui-accent); }
.theme-file { display: grid; gap: 5px; }
.theme-file input { max-width: 100%; min-width: 0; }
p { margin: 0; color: var(--ui-muted); line-height: 1.5; }
p[role=alert] { color: var(--ui-danger); }
</style>
