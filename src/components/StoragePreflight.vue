<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import type { WorkspaceTools } from '../data/workspaceTools'
import { discardMigrationCandidate, isCandidateCurrent, migrationCandidateLimit, prepareMigration, readMigrationCandidate, stageMigration, type MigrationCandidate, type MigrationReport } from '../data/storagePreflight'
const props=defineProps<{tools:WorkspaceTools}>()
const candidate=shallowRef<MigrationCandidate>(),saved=shallowRef<MigrationCandidate>(),report=shallowRef<MigrationReport>()
const busy=ref(false),status=ref(''),current=ref(false)
async function run(action:()=>Promise<void>){
 if(busy.value)return
 busy.value=true;status.value=''
 try{await action()}catch(error){status.value=error instanceof Error?error.message:'操作失败，原数据未修改。'}
 finally{busy.value=false}
}
async function refresh(){saved.value=await readMigrationCandidate();current.value=!!saved.value&&isCandidateCurrent(saved.value,props.tools.getBackup())}
onMounted(()=>void run(refresh))
function inspect(){return run(async()=>{
 candidate.value=undefined;report.value=undefined
 await refresh()
 const plan=await prepareMigration(props.tools.getBackup)
 candidate.value=plan.candidate;report.value=plan.report
 status.value='检查完成。尚未切换存储。'
})}
function stage(){return run(async()=>{
 if(!candidate.value)return
 if(saved.value&&!window.confirm('替换上一次独立迁移候选？原数据不会修改。'))return
 saved.value=await stageMigration(candidate.value,saved.value?.id??null,props.tools.getBackup)
 current.value=isCandidateCurrent(saved.value,props.tools.getBackup())
 status.value=current.value?'候选已写入并回读验证，原存储未修改。':'候选已保存，但来源随后变化，请重新检查。'
})}
function remove(){return run(async()=>{
 if(!saved.value||!window.confirm('仅删除独立迁移候选，保留所有原数据？'))return
 await discardMigrationCandidate(saved.value.id);await refresh();status.value='候选已删除，原数据保留。'
})}
</script>
<template>
 <fieldset class="storage-preflight" :disabled="busy">
  <legend>本地存储迁移预检</legend>
  <p>当前仍使用原 localStorage。仅创建独立候选，保留原始键与工作区快照，不会切换存储或自动恢复。</p>
  <div class="preflight-actions"><button type="button" @click="inspect">检查迁移来源</button><button type="button" @click="run(refresh)">刷新候选状态</button></div>
  <div v-if="report" class="preflight-report">
   <p>{{report.shortcuts}} 个入口 · {{report.folders}} 个文件夹 · {{report.workspaces}} 个工作区 · {{report.notes}} 条笔记 · {{report.todos}} 条待办</p>
   <p>{{report.persisted}} 个已保存键 · {{(report.bytes/1024).toFixed(1)}} KiB / 8192 KiB</p>
   <p v-if="report.normalizedKeys.length">原始值与当前快照存在差异（原值仍保留）：{{report.normalizedKeys.join('、')}}</p>
   <p v-if="report.changedDomains.length">备份解析会调整的字段：{{report.changedDomains.join('、')}}。候选保留原快照，不自动应用。</p>
   <p v-if="report.unknownKeys.length">不在本次迁移范围的键：{{report.unknownKeys.join('、')}}，不会修改。</p>
   <button type="button" :disabled="report.bytes>migrationCandidateLimit" @click="stage">保存独立迁移候选</button>
  </div>
  <div v-if="saved" class="preflight-report">
   <strong>已保存候选</strong><p>{{new Date(saved.createdAt).toLocaleString()}} · {{current?'最近检查时与来源一致':'来源已变化或尚未验证，请重新检查'}}</p>
   <button type="button" @click="remove">删除独立候选</button>
  </div>
  <p v-if="status" role="status">{{status}}</p>
 </fieldset>
</template>
<style scoped>
.storage-preflight{display:grid;gap:10px;min-width:0;margin:12px 0 0;padding:12px;border:1px solid var(--ui-border);border-radius:var(--ui-radius-card);color:var(--ui-text);font-size:12px}
legend{font-weight:600}p{margin:0;color:var(--ui-muted);line-height:1.5;overflow-wrap:anywhere}.preflight-actions{display:flex;gap:6px;flex-wrap:wrap}.preflight-report{display:grid;gap:8px;border-top:1px solid var(--ui-border);padding-top:10px}button{min-height:36px;padding:6px 10px;border:1px solid var(--ui-border);background:var(--ui-accent-soft);color:var(--ui-text);border-radius:var(--ui-radius-control);cursor:pointer}button:disabled{opacity:.5}
</style>
