import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { findLauncherMatches as baseline } from './benchmark-launcher-baseline.ts'
import { createLauncherSearchIndex } from '../src/data/launcherSearch.ts'

const items = Array.from({length:500},(_,i)=>({
  id:'site-'+i, title:'Reference '+i, color:'#467d68', mark:'R',
  shortcut:{id:'site-'+i,title:'Reference '+i,url:'https://example.com/'+i,color:'#467d68',mark:'R',tags:i%3===0?['Vue','前端']:['资料']},
}))
items.push({id:'calculator',title:'计算器',action:'calculator',color:'#fff',mark:'C'})
const folders = Array.from({length:20},(_,i)=>({id:'folder-'+i,title:'阅读资料 '+i,shortcutIds:items.slice(i*25,i*25+4).map(item=>item.id),color:'#467d68',mark:'F'}))
for (const folder of folders) items.push({id:folder.id,title:folder.title,folder,color:folder.color,mark:folder.mark})
const workspaces = Array.from({length:20},(_,i)=>({id:'ws-'+i,name:'Workspace '+i,itemIds:[...items.slice(i*25,i*25+25).map(item=>item.id),folders[i].id,'calculator']}))
const source = {items,folders,workspaces,hiddenItemIds:['site-1']}
const queries = ['r','re','ref','refer','reference','reference 49','前端','vue','阅读','计算','workspace 19','no match']
const scope = 'ws-19'
const before = query => baseline({...source,query,activeWorkspaceId:scope,allWorkspaces:true})
const index = createLauncherSearchIndex(source)
const after = query => index.search(query,scope,true)
for (const query of queries) assert.deepEqual(after(query),before(query), 'Search parity: '+query)
for (let i=0;i<10;i++) for (const query of queries) {before(query);after(query)}
function measure(fn) {
  const start = performance.now()
  fn()
  return performance.now()-start
}
const samples = {build:[],baseline:[],indexed:[]}
for (let i=0;i<40;i++) {
  samples.build.push(measure(()=>createLauncherSearchIndex(source)))
  const pair = i%2 ? ['indexed','baseline'] : ['baseline','indexed']
  for (const key of pair) samples[key].push(measure(()=>{for(const query of queries) (key==='baseline'?before:after)(query)}))
}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1].toFixed(3)
console.log('500 shortcuts / 20 workspaces / 20 folders / 12 queries; 40 samples, milliseconds per batch')
console.table(Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{p50:percentile(values,.5),p95:percentile(values,.95)}])))
console.log('Parity passed. Timings are diagnostic, not a merge threshold; index construction is reported separately.')
