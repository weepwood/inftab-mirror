import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const here = fileURLToPath(new URL('./', import.meta.url))
const write = (name, data) => writeFileSync(resolve(dist,name),data)
const read = name => readFileSync(resolve(dist,name))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
// Generate simple self-contained PNG icons without a runtime dependency.
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type,data) {
  const body = Buffer.concat([Buffer.from(type),data])
  const size = Buffer.alloc(4), crc = Buffer.alloc(4)
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([size,body,crc])
}
function icon(size) {
  const header=Buffer.alloc(13)
  header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=2
  const data=Buffer.alloc(size*(1+size*3))
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const u=x/size,v=y/size
    const tile = [0.28,0.53].some(left=>u>=left&&u<left+.19)
      && [0.28,0.53].some(top=>v>=top&&v<top+.19)
    const color=tile?[239,248,242]:[36,71,56]
    const i=y*(1+size*3)+1+x*3
    data.set(color,i)
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))])
}
for (const size of [192,512]) write('pwa-'+size+'.png',icon(size))
write('app.webmanifest',JSON.stringify({
  id:'./',name:'Inftab 个人工作台',short_name:'Inftab',lang:'zh-CN',
  start_url:'./',scope:'./',display:'standalone',background_color:'#171a1b',theme_color:'#244738',
  icons:[192,512].map(size=>({src:'pwa-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any maskable'})),
},null,2))
write('pwa-client.js',readFileSync(resolve(here,'pwa-client.js')))
write('pwa.css',readFileSync(resolve(here,'pwa.css')))
const html=read('index.html').toString()
if (!html.includes('</body>')) throw Error('PWA: invalid built HTML')
write('index.html',html.replace('</body>','<script defer src="./pwa-client.js"></script>\n  </body>'))
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)])}
const allowed = /^(?:index\.html|app\.webmanifest|pwa-client\.js|pwa\.css|pwa-(?:192|512)\.png|windmill\.svg|(?:assets|wallpapers|search-engines|inftab-icons)\/[^?#]+)$/
const files=walk(dist).map(path=>relative(dist,path).split(sep).join('/')).filter(name=>allowed.test(name)).sort()
if (!files.includes('index.html') || !files.some(name=>name.startsWith('assets/'))) throw Error('PWA: missing app shell')
const records=files.map(path=>({path,hash:sha(read(path))}))
const bytes=files.reduce((sum,path)=>sum+read(path).length,0)
if(bytes>4*1024*1024) throw Error('PWA: precache exceeds 4 MiB')
const worker=readFileSync(resolve(here,'pwa-worker.js'),'utf8')
const revision=sha(Buffer.from(worker+JSON.stringify(records))).slice(0,24)
write('sw.js','const REVISION = '+JSON.stringify(revision)+';\nconst ASSETS = '+JSON.stringify(records)+';\n'+worker)
console.log('PWA precache: '+records.length+' assets, '+bytes+' bytes, revision '+revision)
