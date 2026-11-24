import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
const core = resolve('dist'), web = resolve('dist-web')
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)])
const coreFiles = new Set(walk(core).map(p=>relative(core,p)))
const extras = []
for (const path of walk(web)) {
  const name = relative(web,path)
  if (name === 'index.html') continue
  if (coreFiles.has(name)) {
    if (!readFileSync(path).equals(readFileSync(resolve(core,name)))) throw Error('Core asset changed: '+name)
  } else extras.push(path)
}
const expected = ['pwa-bootstrap.js','pwa-client.js','sw.js','pwa.css','app.webmanifest','pwa-192.png','pwa-512.png']
if (extras.length !== expected.length || !expected.every(name=>extras.includes(resolve(web,name)))) throw Error('Unexpected web-only artifacts')
for (const name of coreFiles) if (name !== 'manifest.json' && !walk(web).includes(resolve(web,name))) throw Error('Missing web core asset: '+name)
const html = readFileSync(resolve(web,'index.html'),'utf8')
if (!html.includes('pwa-bootstrap.js') || html.includes('src="./pwa-client.js"') || walk(web).includes(resolve(web,'manifest.json'))) throw Error('Invalid web shell or eager PWA client')
const gzip = paths=>paths.reduce((sum,p)=>sum+gzipSync(readFileSync(p)).length,0)
const bootstrap = gzip([resolve(web,'pwa-bootstrap.js')])
const addedJS = gzip(extras.filter(p=>p.endsWith('.js')))
const total = walk(web).reduce((sum,p)=>sum+statSync(p).size,0)
console.log('PWA budgets: bootstrap '+bootstrap+'/512 B; web-only JS '+addedJS+'/10240 B; full website '+total+'/4194304 B')
if (bootstrap>512 || addedJS>10240 || total>4*1024*1024) throw Error('Web-only PWA budget exceeded')
