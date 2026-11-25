<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { exportRehearsalDraft, previewRehearsalDraft } from '../data/rehearsalDraft'
import { downloadText } from '../data/downloadBackup'
import { inspectGeneration, prepareGeneration, transitionGeneration, type GenerationState } from '../data/workspaceGeneration'
import type { WorkspaceTools } from '../data/workspaceTools'
import { discardMigrationCandidate, isCandidateCurrent, migrationCandidateLimit, prepareMigration, readMigrationCandidate, stageMigration, type MigrationCandidate, type MigrationReport } from '../data/storagePreflight'
const props=defineProps<{tools:WorkspaceTools}>()
const candidate=shallowRef<MigrationCandidate>(),saved=shallowRef<MigrationCandidate>(),report=shallowRef<MigrationReport>()
const generation=shallowRef<GenerationState>(),drift=ref(false),preview=shallowRef<ReturnType<typeof previewRehearsalDraft>>()
const busy=ref(false),status=ref(''),current=ref(false)
async function run(action:()=>Promise<void>){
 if(busy.value)return
 busy.value=true;status.value=''
 try{await action()}catch(error){status.value=error instanceof Error?error.message:'操作失败，原数据未修改。'}
 finally{busy.value=false}
}
async function refresh(){saved.value=await readMigrationCandidate();current.value=!!saved.value&&isCandidateCurrent(saved.value,props.tools.getBackup())}
async function refreshGeneration(){
 const result=await inspectGeneration()
 generation.value=result.state;drift.value=result.sourceChanged
}
onMounted(()=>void run(async()=>{await refresh();await refreshGeneration()}))
function prepare(){return run(async()=>{
 if(!saved.value)return
 if(!window.confirm('从当前候选创建独立演练？接受备份规范化，原始候选保持不变。'))return
 const old=generation.value
 if(old&&!window.confirm('替换退役世代？请先导出其完整记录。'))return
 generation.value=await prepareGeneration(saved.value,old??null,()=>props.tools.getBackup(),true,!!old)
 await refreshGeneration();status.value='演练已准备，未修改原数据。'
})}
function transition(kind:'start'|'rollback'|'retire'){return run(async()=>{
 if(!generation.value)return
 if(kind!=='start'&&!window.confirm(kind==='rollback'?'回退独立草稿至上一版本？':'结束演练并保留草稿？'))return
 generation.value=await transitionGeneration(generation.value,{kind})
 await refreshGeneration();status.value='演练状态已更新，原数据未修改。'
})}
function importDraft(event:Event){return run(async()=>{
 const input=event.target as HTMLInputElement,file=input.files?.[0]
 input.value=''
 if(!file)return
 preview.value=undefined
 if(file.size>migrationCandidateLimit)throw new Error('草稿超过 8 MiB。')
 const content=await file.text()
 await refreshGeneration()
 if(!generation.value||generation.value.phase!=='rehearsal'||drift.value)throw new Error('当前演练不可写入。')
 preview.value=previewRehearsalDraft(content,generation.value)
 status.value=preview.value.conflicts.length?'存在冲突，保留原草稿。':'预览完成，确认后提交。'
})}
function applyDraft(){return run(async()=>{
 const p=preview.value
 if(!p?.merged||p.conflicts.length)return
 generation.value=await transitionGeneration(p.expected,{kind:'commit',content:JSON.stringify(p.merged)})
 preview.value=undefined
 await refreshGeneration();status.value='独立草稿已提交，原数据未修改。'
})}
function exportDraft(all=false){
 const g=generation.value
 if(g)downloadText(all?JSON.stringify(g):exportRehearsalDraft(g),'application/json',all?'inftab-rehearsal-record.json':'inftab-rehearsal-draft.json')
}
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
  <div class="preflight-actions"><button type="button" @click="inspect">检查迁移来源</button><button type="button" @click="run(async()=>{await refresh();await refreshGeneration()})">刷新候选状态</button></div>
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
  <div class="preflight-report">
   <strong>独立存储演练</strong>
   <p>演练仅修改独立快照，不能作为生产数据源。导出带世代与版本的 JSON，编辑 draft 字段后预览提交。</p>
   <button v-if="saved&&(!generation||generation.phase==='retired')" type="button" :disabled="!current" @click="prepare">准备演练世代</button>
   <template v-if="generation">
    <p>{{ {prepared:'已准备',rehearsal:'演练中',retired:'已退役'}[generation.phase] }} · Revision {{generation.revision}}</p>
    <p v-if="drift">旧存储已变化，暂停演练写入；仍可导出或结束。</p>
    <div class="preflight-actions">
     <button v-if="generation.phase==='prepared'" type="button" :disabled="drift" @click="transition('start')">启动演练</button>
     <button v-if="generation.phase==='rehearsal'" type="button" :disabled="drift||!generation.previous" @click="transition('rollback')">回退独立草稿</button>
     <button v-if="generation.phase!=='retired'" type="button" @click="transition('retire')">结束演练</button>
     <button type="button" @click="exportDraft()">导出独立草稿</button>
     <button type="button" @click="exportDraft(true)">导出完整演练记录</button>
    </div>
    <label v-if="generation.phase==='rehearsal'">提交独立 JSON 草稿<input type="file" aria-label="提交独立 JSON 草稿" accept=".json,application/json" :disabled="drift" @change="importDraft"/></label>
    <div v-if="preview" class="preflight-report">
     <p>基础 Revision {{preview.baseRevision}} → 当前 {{preview.expected.revision}}</p>
     <p v-for="c in preview.conflicts.slice(0,20)" :key="c.path">{{c.path}} · {{ { 'concurrent-edit':'同字段修改','delete-edit':'删除与修改','order':'顺序冲突','reference':'引用冲突' }[c.reason] }}</p>
     <p v-if="preview.conflicts.length">共 {{preview.conflicts.length}} 项冲突，原文件保留，请手动处理后重新导入。</p>
     <button v-else type="button" :disabled="drift||generation.phase!=='rehearsal'" @click="applyDraft">确认提交预览</button>
     <button type="button" @click="downloadText(JSON.stringify({format:'inftab-rehearsal',version:1,generation:preview.expected.generation,revision:preview.baseRevision,draft:preview.local}),'application/json','inftab-local-draft-backup.json')">导出未提交内容</button>
    </div>
   </template>
  </div>
  <p v-if="status" role="status">{{status}}</p>
 </fieldset>
</template>
<style scoped>
.storage-preflight{display:grid;gap:10px;min-width:0;margin:12px 0 0;padding:12px;border:1px solid var(--ui-border);border-radius:var(--ui-radius-card);color:var(--ui-text);font-size:12px}
legend{font-weight:600}p{margin:0;color:var(--ui-muted);line-height:1.5;overflow-wrap:anywhere}.preflight-actions{display:flex;gap:6px;flex-wrap:wrap}.preflight-report{display:grid;gap:8px;border-top:1px solid var(--ui-border);padding-top:10px}button{min-height:36px;padding:6px 10px;border:1px solid var(--ui-border);background:var(--ui-accent-soft);color:var(--ui-text);border-radius:var(--ui-radius-control);cursor:pointer}button:disabled{opacity:.5}input[type=file]{max-width:100%;min-width:0}
</style>
