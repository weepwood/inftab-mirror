<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { availableHomeWidgetIds, type HomeWidgetId, type Preferences } from '../types'
import type { HomeWorkspace } from '../data/homeWorkspaces'
import { createLayoutDraft, moveWidget, type LayoutEditorDraft } from '../data/layoutEditor'
import { resolveWorkspaceLayout } from '../data/workspaceLayout'
import { homeWidgetPlugins } from '../plugins/widgetRegistry'
import { homeWidgetPresets } from '../data/homeWidgetPresets'
import { trapOverlayTab, isComposingKey } from '../composables/overlayFocus'

const props = defineProps<{ workspace: HomeWorkspace; preferences: Preferences; save: (draft: LayoutEditorDraft) => string | undefined }>()
const emit = defineEmits<{ close: [] }>()
const draft = ref(createLayoutDraft(props.workspace, props.preferences))
const tab = ref<'layout' | 'widgets'>('layout')
const dialog = ref<HTMLDialogElement>()
const error = ref('')
const query = ref('')
let previousFocus: HTMLElement | undefined
const preview = computed(() => draft.value.inherit ? resolveWorkspaceLayout(props.preferences) : draft.value.layout)
const catalog = computed(() => availableHomeWidgetIds.filter(id => !draft.value.widgetIds.includes(id) && (homeWidgetPlugins[id].title + homeWidgetPlugins[id].description).includes(query.value.trim())))
function toggleWidget(id: HomeWidgetId) { draft.value.widgetIds = draft.value.widgetIds.includes(id) ? draft.value.widgetIds.filter(item => item !== id) : [...draft.value.widgetIds, id] }
function reorder(id: HomeWidgetId, direction: -1 | 1) { draft.value.widgetIds = moveWidget(draft.value.widgetIds, id, direction) }
function apply() { error.value = props.save(draft.value) ?? '' }
function keydown(event: KeyboardEvent) {
  if (isComposingKey(event)) { event.stopPropagation(); return }
  if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  trapOverlayTab(event, dialog.value)
}
onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  if (typeof dialog.value?.showModal === 'function') dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
  void nextTick(() => dialog.value?.querySelector<HTMLButtonElement>('.editor-tab-active')?.focus())
})
onBeforeUnmount(() => { dialog.value?.close?.(); if (previousFocus?.isConnected) previousFocus.focus() })
</script>

<template>
  <dialog ref="dialog" class="layout-editor" aria-labelledby="layout-editor-title" @keydown="keydown" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="layout-editor-shell">
      <header><div><h2 id="layout-editor-title">首页布局编辑</h2><p>工作区：{{ workspace.name }} · 修改在保存后生效</p></div><button type="button" aria-label="关闭布局编辑器" @click="emit('close')">×</button></header>
      <nav aria-label="编辑分区"><button type="button" :class="{ 'editor-tab-active': tab === 'layout' }" :aria-pressed="tab === 'layout'" @click="tab = 'layout'">网格布局</button><button type="button" :class="{ 'editor-tab-active': tab === 'widgets' }" :aria-pressed="tab === 'widgets'" @click="tab = 'widgets'">小组件管理 · {{ draft.widgetIds.length }}</button></nav>
      <div class="layout-editor-body">
        <section v-if="tab === 'layout'" class="editor-grid">
          <div class="editor-preview" aria-label="网格布局预览">
            <div class="editor-preview-clock">09:41</div><div class="editor-preview-search"></div>
            <div class="editor-preview-grid" :style="{ gridTemplateColumns: 'repeat(' + preview.columns + ', minmax(0, 1fr))' }"><div v-for="i in Math.min(preview.columns * preview.rows, 96)" :key="i" class="editor-preview-item"><span :style="{ width: Math.min(100, preview.iconSize / 1.6) + '%', borderRadius: Math.min(50, preview.iconRadius / 2) + '%' }"></span><small v-if="preview.showNames"></small></div></div>
          </div>
          <div class="editor-controls"><label class="editor-check"><input v-model="draft.inherit" type="checkbox" /> 跟随全局布局</label><fieldset :disabled="draft.inherit"><label>每行图标 <output>{{ preview.columns }}</output><input v-model.number="draft.layout.columns" aria-label="每行图标" type="range" min="2" max="12" /></label><label>每页行数 <output>{{ preview.rows }}</output><input v-model.number="draft.layout.rows" aria-label="每页行数" type="range" min="1" max="8" /></label><label>图标大小 <output>{{ preview.iconSize }} px</output><input v-model.number="draft.layout.iconSize" aria-label="图标大小" type="range" min="32" max="160" /></label><label>图标圆角 <output>{{ preview.iconRadius }} px</output><input v-model.number="draft.layout.iconRadius" aria-label="图标圆角" type="range" min="0" max="100" /></label><label class="editor-check"><input v-model="draft.layout.showNames" type="checkbox" /> 显示网站名称</label></fieldset><p>网格仅影响当前工作区。实际首页会按屏幕尺寸适配。</p></div>
        </section>
        <section v-else class="editor-widgets">
          <p>小组件设置在所有工作区共享；预览不会启动联网组件。保存后仍遵循原有授权规则。</p>
          <div class="editor-presets"><button v-for="preset in homeWidgetPresets" :key="preset.title" type="button" @click="draft.widgetIds = [...preset.widgetIds]">{{ preset.title }}</button><button type="button" @click="draft.widgetIds = []">清空组件</button></div>
          <h3>已启用</h3><p v-if="!draft.widgetIds.length">还没有启用小组件。</p>
          <div v-for="(id, index) in draft.widgetIds" :key="id" class="editor-widget-row"><strong>{{ homeWidgetPlugins[id].title }}</strong><select v-model="draft.widgetSizes[id]" :aria-label="homeWidgetPlugins[id].title + '尺寸'"><option value="standard">标准</option><option value="wide">加宽</option><option value="full">整行</option></select><button type="button" :aria-label="homeWidgetPlugins[id].title + '上移'" :disabled="index === 0" @click="reorder(id, -1)">↑</button><button type="button" :aria-label="homeWidgetPlugins[id].title + '下移'" :disabled="index === draft.widgetIds.length - 1" @click="reorder(id, 1)">↓</button><button type="button" :aria-label="'移除' + homeWidgetPlugins[id].title" @click="toggleWidget(id)">移除</button></div>
          <h3>可添加</h3><input v-model="query" type="search" aria-label="搜索小组件" placeholder="搜索小组件…" /><div v-for="id in catalog" :key="id" class="editor-widget-row"><span><strong>{{ homeWidgetPlugins[id].title }}</strong><small>{{ homeWidgetPlugins[id].description }}</small></span><button type="button" :aria-label="'添加' + homeWidgetPlugins[id].title" @click="toggleWidget(id)">添加</button></div><p v-if="!catalog.length">没有匹配的未启用组件。</p>
        </section>
      </div>
      <p v-if="error" role="alert" class="editor-error">{{ error }}</p>
      <footer><button class="button-secondary" type="button" @click="emit('close')">取消</button><button class="button-primary" type="button" @click="apply">保存布局与组件</button></footer>
    </div>
  </dialog>
</template>

<style scoped>
.layout-editor { width: min(720px, calc(100% - 24px)); max-height: calc(100dvh - 24px); padding: 0; margin: auto; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-dialog); background: var(--ui-surface); color: var(--ui-text); box-shadow: var(--ui-menu-shadow); overflow: hidden; }
.layout-editor::backdrop { background: rgba(12,22,18,.36); backdrop-filter: blur(4px); }
.layout-editor-shell { display: flex; flex-direction: column; max-height: calc(100dvh - 26px); }
header, footer, nav { display: flex; gap: 8px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--ui-border); }
header { justify-content: space-between; } h2 { font-size: 17px; margin: 0; } p { color: var(--ui-muted); font-size: 12px; margin: 5px 0; }
button, select { color: var(--ui-text); border: 1px solid var(--ui-border); background: var(--ui-field); border-radius: var(--ui-radius-control); min-height: 32px; padding: 5px 9px; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
.editor-tab-active { color: var(--ui-accent-text); background: var(--ui-accent-soft); }
.layout-editor-body { padding: 16px; overflow: auto; min-height: 0; overscroll-behavior: contain; }
.editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 16px; }
.editor-preview { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-card); padding: 16px 12px; background: var(--ui-panel); min-height: 180px; }
.editor-preview-clock { font-size: 24px; text-align: center; font-weight: 600; }
.editor-preview-search { height: 12px; background: var(--ui-surface); border-radius: 9px; width: 80%; margin: 10px auto; }
.editor-preview-grid { display: grid; gap: 5px; }
.editor-preview-item { display: grid; justify-items: center; align-content: start; gap: 3px; min-width: 0; }
.editor-preview-item span { background: var(--ui-accent); opacity: .7; aspect-ratio: 1; }
.editor-preview-item small { width: 70%; height: 3px; border-radius: 3px; background: var(--ui-muted); opacity: .5; }
.editor-controls fieldset { border: 0; margin: 8px 0; padding: 0; display: grid; gap: 9px; }
.editor-controls label { display: flex; justify-content: space-between; flex-wrap: wrap; font-size: 12px; }
.editor-controls input[type=range] { width: 100%; accent-color: var(--ui-accent); }
.editor-controls .editor-check { justify-content: flex-start; gap: 7px; align-items: center; }
.editor-widgets { display: grid; gap: 7px; } .editor-widgets h3 { margin: 5px 0; font-size: 13px; }
.editor-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.editor-widget-row { display: flex; align-items: center; gap: 6px; padding: 8px; background: var(--ui-field); border: 1px solid var(--ui-border); border-radius: 10px; font-size: 12px; }
.editor-widget-row > span, .editor-widget-row > strong { flex: 1; min-width: 0; } small { display: block; color: var(--ui-muted); font-size: 11px; }
.editor-widgets input[type=search] { padding: 8px; border: 1px solid var(--ui-border); border-radius: 8px; color: var(--ui-text); background: var(--ui-field); width: 100%; }
.editor-error { color: var(--ui-danger); padding: 0 16px; }
footer { border-top: 1px solid var(--ui-border); border-bottom: 0; justify-content: flex-end; } footer .button-primary { color: white; background: var(--ui-accent); }
@media (max-width: 520px) { .editor-grid { grid-template-columns: 1fr; } .editor-widget-row { flex-wrap: wrap; } }
</style>
