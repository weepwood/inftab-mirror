<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { WorkspaceTools, ShortcutBatch } from '../data/workspaceTools'
import { previewBookmarkHtml, downloadBookmarkHtml, maxBookmarkHtmlBytes } from '../data/bookmarkHtml'
import { captureHistory, listHistory, readHistory, type HistorySummary } from '../data/backupHistory'
import { normalizeWebUrl } from '../data/urls'
import { downloadWorkspaceBackup } from '../data/downloadBackup'
import type { WorkspaceBackup } from '../data/backup'

const props = defineProps<{ tools: WorkspaceTools }>()
const query = ref('')
const tagFilter = ref('')
const selected = ref<string[]>([])
const destination = ref('')
const tag = ref('')
const status = ref('')
const busy = ref(false)
const confirmDelete = ref(false)
const preview = ref<ReturnType<typeof previewBookmarkHtml>>()
const history = ref<HistorySummary[]>([])
const restore = ref<WorkspaceBackup>()
const previewWorkspaceId = ref('')
watch(selected, () => { confirmDelete.value = false })
watch(() => props.tools.activeId, () => { preview.value = undefined })
const tags = computed(() => [...new Set(props.tools.shortcuts.flatMap(item => item.tags ?? []))].sort())
const searchRows = computed(() => props.tools.shortcuts.map(item => ({ item, text: (item.title + ' ' + item.url + ' ' + (item.tags ?? []).join(' ')).toLowerCase() })))
const filtered = computed(() => {
  const term = query.value.trim().toLowerCase()
  return searchRows.value.filter(row => (!tagFilter.value || row.item.tags?.includes(tagFilter.value)) && row.text.includes(term)).map(row => row.item)
})
const shortcutIds = computed(() => new Set(props.tools.shortcuts.map(item => item.id)))
const selectedIds = computed(() => selected.value.filter(id => shortcutIds.value.has(id)))
const ownerById = computed(() => {
  const result = new Map<string,string>()
  for (const workspace of props.tools.workspaces) for (const id of workspace.itemIds) if (!result.has(id)) result.set(id, workspace.name)
  return result
})
function selectVisible() { selected.value = [...new Set([...selectedIds.value, ...filtered.value.map(item => item.id)])] }
function owner(id: string) { return ownerById.value.get(id) ?? '未分配' }
async function execute(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  status.value = ''
  try { await fn() } catch (error) { status.value = error instanceof Error ? error.message : '操作失败，请重试。' }
  finally { busy.value = false }
}
async function refresh() { history.value = await listHistory() }
onMounted(() => { void execute(refresh) })
const signature = (snapshot: WorkspaceBackup) => JSON.stringify({ ...snapshot, exportedAt: '' })
async function safeguard() {
  const before = props.tools.getBackup()
  await captureHistory(before, 'before-change')
  const expected = signature(before)
  if (expected !== signature(props.tools.getBackup())) throw new Error('数据在备份期间发生变化，请重新操作。')
  return expected
}
function batch(kind: ShortcutBatch['kind']) {
  if (!selectedIds.value.length) return
  if (kind === 'delete' && !confirmDelete.value) { confirmDelete.value = true; return }
  void execute(async () => {
    const ids = [...selectedIds.value]
    const action: ShortcutBatch = kind === 'move' ? { ids, kind, workspaceId: destination.value }
      : kind === 'delete' ? { ids, kind } : { ids, kind, tag: tag.value }
    const expected = kind === 'delete' || kind === 'move' ? await safeguard() : undefined
    const error = await props.tools.batch(action, expected)
    if (error) throw new Error(error)
    confirmDelete.value = false
    selected.value = []
    if (kind === 'delete' || kind === 'move') await refresh()
    status.value = `已处理 ${ids.length} 个入口。`
  })
}
function readHtml(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  preview.value = undefined
  void execute(async () => {
    if (file.size > maxBookmarkHtmlBytes) throw new Error('文件超过 5 MiB。')
    const workspaceId = props.tools.activeId
    const html = await file.text()
    if (workspaceId !== props.tools.activeId) throw new Error('工作区已切换，请重新选择书签文件。')
    previewWorkspaceId.value = workspaceId
    preview.value = previewBookmarkHtml(html, props.tools.shortcuts, 500 - props.tools.shortcuts.length)
  })
}
function applyHtml() {
  if (!preview.value) return
  void execute(async () => {
    const entries = preview.value?.items ?? []
    if (previewWorkspaceId.value !== props.tools.activeId) throw new Error('工作区已切换，请重新预览。')
    const existing = new Set(props.tools.shortcuts.map(item => normalizeWebUrl(item.url)))
    const fresh = entries.filter(item => !existing.has(item.url))
    if (!fresh.length || props.tools.shortcuts.length + fresh.length > 500) throw new Error('可用空间或入口已变化，请重新预览。')
    const result = props.tools.importBookmarks(fresh)
    if (result.error) throw new Error(result.error)
    preview.value = undefined
    status.value = `已导入 ${result.added} 个入口。`
  })
}
function capture() { void execute(async () => { await captureHistory(props.tools.getBackup(), 'manual'); await refresh(); status.value = '已保存本地恢复点。' }) }
function loadRestore(id: string) { void execute(async () => { restore.value = await readHistory(id) }) }
function applyRestore(mode: 'merge' | 'replace') {
  if (!restore.value) return
  void execute(async () => {
    const target = restore.value!
    await safeguard()
    const error = props.tools.restore(target, mode)
    if (error) throw new Error(error)
    restore.value = undefined
    selected.value = []
    await refresh()
    status.value = '恢复完成。'
  })
}
function exportHistory(id: string) { void execute(async () => { downloadWorkspaceBackup(await readHistory(id)) }) }
</script>

<template>
  <div class="shortcut-manager">
    <fieldset :disabled="busy">
      <legend>批量管理快捷入口</legend>
      <label>搜索入口<input v-model="query" type="search" placeholder="名称、网址、标签" /></label>
      <label>标签筛选<select v-model="tagFilter"><option value="">全部标签</option><option v-for="item in tags" :key="item">{{ item }}</option></select></label>
      <div class="manager-actions"><button type="button" @click="selectVisible">全选筛选结果</button><button type="button" @click="selected = []; confirmDelete = false">清空选择</button><span>{{ selectedIds.length }} / {{ tools.shortcuts.length }} 已选</span></div>
      <div class="manager-list" role="group" aria-label="选择快捷入口">
        <label v-for="item in filtered" :key="item.id" class="manager-item"><input v-model="selected" type="checkbox" :value="item.id" /><span><strong>{{ item.title }}</strong><small>{{ owner(item.id) }} · {{ item.url }}</small><small v-if="item.tags?.length">{{ item.tags.join(' · ') }}</small></span></label>
        <p v-if="!filtered.length">没有匹配入口。</p>
      </div>
      <label>目标工作区<select v-model="destination"><option value="">选择工作区</option><option v-for="item in tools.workspaces" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <div class="manager-actions"><button type="button" :disabled="!selectedIds.length || !destination" @click="batch('move')">批量移动</button></div>
      <label>标签<input v-model="tag" maxlength="24" placeholder="例如：学习" /></label>
      <div class="manager-actions"><button type="button" :disabled="!selectedIds.length || !tag.trim()" @click="batch('tag')">添加标签</button><button type="button" :disabled="!selectedIds.length || !tag.trim()" @click="batch('untag')">移除标签</button></div>
      <div class="manager-actions"><button type="button" :disabled="!selectedIds.length" @click="batch('delete')">{{ confirmDelete ? '确认删除所选入口' : '批量删除' }}</button><button v-if="confirmDelete" type="button" @click="confirmDelete = false">取消</button></div>
      <p v-if="confirmDelete" class="manager-warning">将删除当前 {{ selectedIds.length }} 项，先保存恢复点；失败则不执行。</p>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>HTML 书签</legend>
      <p>导入到当前工作区，文件夹展平；只接受 HTTP/HTTPS，跳过重复和无效链接。</p>
      <label>选择 HTML 文件<input type="file" accept=".html,.htm,text/html" @change="readHtml" /></label>
      <div v-if="preview" class="manager-preview"><p>可导入 {{ preview.items.length }} · 重复 {{ preview.duplicates }} · 无效 {{ preview.invalid }} · 超出上限 {{ preview.overflow }}</p>
        <ul><li v-for="item in preview.items.slice(0, 8)" :key="item.url">{{ item.title }}</li></ul>
        <div class="manager-actions"><button type="button" :disabled="!preview.items.length" @click="applyHtml">确认导入 {{ preview.items.length }} 项</button><button type="button" @click="preview = undefined">取消</button></div>
      </div>
      <button type="button" @click="downloadBookmarkHtml(tools.getBackup())">导出 HTML 书签</button>
    </fieldset>
    <fieldset :disabled="busy">
      <legend>本地备份历史</legend>
      <p>打开首页后每日最多自动备份一次；保留最近 7 个恢复点，总容量最多 24 MiB。数据只存于此浏览器，清理站点数据可能删除备份。</p>
      <div class="manager-actions"><button type="button" @click="capture">创建恢复点</button><button type="button" @click="execute(refresh)">刷新</button></div>
      <div v-for="entry in history" :key="entry.id" class="manager-history"><span><strong>{{ new Date(entry.createdAt).toLocaleString() }}</strong><small>{{ entry.reason === 'daily' ? '自动' : entry.reason === 'manual' ? '手动' : '变更前' }} · {{ entry.shortcuts }} 个入口</small></span><button type="button" @click="loadRestore(entry.id)">预览</button><button type="button" @click="exportHistory(entry.id)">导出</button></div>
      <div v-if="restore" class="manager-preview"><p>恢复点：{{ new Date(restore.exportedAt).toLocaleString() }} · {{ restore.shortcuts.length }} 个入口 · {{ restore.notes.length }} 条笔记 · {{ restore.homeWorkspaces?.length ?? 1 }} 个工作区</p><p class="manager-warning">覆盖将替换当前数据，先保存恢复点。合并将按 ID 更新。</p><div class="manager-actions"><button type="button" @click="applyRestore('merge')">合并恢复</button><button type="button" @click="applyRestore('replace')">覆盖恢复</button><button type="button" @click="restore = undefined">取消</button></div></div>
      <p v-if="!history.length">暂无恢复点。</p>
    </fieldset>
    <p v-if="status" role="status" class="manager-status">{{ status }}</p>
  </div>
</template>

<style scoped>
.shortcut-manager { display: grid; gap: 12px; margin-top: 12px; color: var(--ui-text); font-size: 12px; }
fieldset { min-width: 0; border: 1px solid var(--ui-border); border-radius: 12px; padding: 10px; display: grid; gap: 8px; }
legend { font-size: 13px; font-weight: 600; }
label { display: grid; gap: 4px; }
input:not([type=checkbox]), select { width: 100%; min-width: 0; padding: 7px; background: var(--ui-field); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 8px; }
button { min-height: 32px; padding: 4px 8px; border: 1px solid var(--ui-border); background: var(--ui-surface); color: var(--ui-text); border-radius: 8px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.manager-actions, .manager-history { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.manager-list { max-height: 220px; overflow: auto; overscroll-behavior: contain; }
.manager-item { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--ui-border); }
.manager-item span, .manager-history span { display: grid; min-width: 0; flex: 1; gap: 2px; }
small { color: var(--ui-muted); overflow-wrap: anywhere; }
p, ul { margin: 0; }
.manager-preview { padding: 8px; border-radius: 8px; background: var(--ui-field); display: grid; gap: 6px; }
.manager-warning { color: var(--ui-danger); }
.manager-status { color: var(--ui-accent-text); overflow-wrap: anywhere; }
</style>
