<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { parseWorkspaceBackup, type WorkspaceBackup } from '../data/backup'
import { planConfigMigration, type MigrationGroup } from '../data/configMigration'
import { captureHistory } from '../data/backupHistory'
import type { WorkspaceTools } from '../data/workspaceTools'

const props = defineProps<{ tools: WorkspaceTools }>()
const source = ref<WorkspaceBackup>()
const selected = ref<MigrationGroup[]>([])
const status = ref('')
const busy = ref(false)
const confirmed = ref(false)
let readId = 0
let disposed = false
const groups: { id: MigrationGroup; title: string; description: string }[] = [
  {id:'appearance',title:'外观与主题',description:'颜色、主题预设、壁纸和背景暗度'},
  {id:'layout',title:'全局首页布局',description:'网格、搜索栏、时钟、动画；不修改独立工作区布局'},
  {id:'widgets',title:'小组件配置',description:'启用列表、顺序及尺寸；不迁移笔记或待办数据'},
  {id:'entries',title:'快捷入口与工作区',description:'替换快捷入口、文件夹、标签、工作区及 Dock，包含独立布局'},
]
const ready = computed(() => !!source.value && selected.value.length > 0 && confirmed.value && !busy.value)
async function load(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const id = ++readId
  source.value = undefined; selected.value = []; confirmed.value = false; status.value = ''
  busy.value = true
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('备份文件超过 10 MiB。')
    const parsed = parseWorkspaceBackup(JSON.parse(await file.text()))
    if (!disposed && id === readId) source.value = parsed
  } catch (error) { if (!disposed && id === readId) status.value = error instanceof Error ? error.message : '读取失败。' }
  finally { if (!disposed && id === readId) busy.value = false }
}
const signature = (value: WorkspaceBackup) => JSON.stringify({ ...value, exportedAt: '' })
async function apply() {
  if (!ready.value || !source.value) return
  busy.value = true; status.value = ''
  try {
    const before = props.tools.getBackup()
    const next = planConfigMigration(before, source.value, [...selected.value])
    const expected = signature(before)
    await captureHistory(before, 'before-change')
    if (disposed) return
    if (signature(props.tools.getBackup()) !== expected) throw new Error('备份期间数据已变化，请重新确认。')
    const error = props.tools.restore(next, 'replace')
    if (error) throw new Error(error)
    source.value = undefined; selected.value = []; confirmed.value = false
    status.value = '迁移完成，已保存变更前恢复点。'
  } catch (error) { if (!disposed) status.value = error instanceof Error ? error.message : '迁移失败。' }
  finally { if (!disposed) busy.value = false }
}
onBeforeUnmount(() => { disposed = true; readId++ })
</script>
<template>
  <fieldset class="config-migration" :disabled="busy">
    <legend>从工作台备份迁移</legend>
    <label>选择工作台 JSON<input type="file" accept=".json,application/json" aria-label="选择迁移备份" @change="load" /></label>
    <div v-if="source" class="migration-preview">
      <p>源文件：{{ source.shortcuts.length }} 个入口 · {{ source.homeWorkspaces?.length ?? 1 }} 个工作区 · {{ source.preferences.homeWidgetIds.length }} 个组件</p>
      <label v-for="group in groups" :key="group.id" class="migration-group"><input v-model="selected" type="checkbox" :value="group.id" @change="confirmed = false" /><span><strong>{{ group.title }}</strong><small>{{ group.description }}</small></span></label>
      <p>仅替换所选分类；保留未选配置、笔记、待办、习惯、纪念日及搜索引擎。开始前自动备份，失败则停止。</p>
      <label class="migration-group"><input v-model="confirmed" type="checkbox" /><span>确认替换所选分类</span></label>
      <button type="button" :disabled="!ready" @click="apply">执行选择性迁移</button>
    </div>
    <p v-if="status" role="status">{{ status }}</p>
  </fieldset>
</template>
<style scoped>
.config-migration { display: grid; gap: 9px; margin: 12px 0 0; padding: 10px; min-width: 0; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-card); font-size: 12px; }
.config-migration legend { font-weight: 600; }
.config-migration label, .migration-preview { display: grid; gap: 6px; }
.config-migration input[type=file] { min-width: 0; max-width: 100%; }
.config-migration .migration-group { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-control); }
.migration-group span { display: grid; gap: 3px; }
small, p { color: var(--ui-muted); margin: 0; }
button { min-height: 36px; border: 1px solid var(--ui-border); background: var(--ui-accent-soft); color: var(--ui-text); border-radius: var(--ui-radius-control); }
button:disabled { opacity: .5; }
</style>
