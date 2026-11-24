import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'

const workerSource = readFileSync(new URL('../scripts/pwa-worker.js', import.meta.url), 'utf8')
const sha = (content: string) => createHash('sha256').update(content).digest('hex')
const revision = (version: number) => version.toString(16).padStart(24, '0')
const scopePath = '/inftab-mirror/'
function fixture() {
  let version = 1
  let corrupt = false
  let requests = 0
  const files = () => ({
    'index.html': '<!doctype html><title>Fixture '+version+'</title><main>Version '+version+'</main>',
    'assets/lazy.js': 'export default '+version,
  })
  const server = createServer((req,res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    res.setHeader('Cache-Control','no-store')
    const data = files()
    if(path === scopePath+'sw.js') {
      res.setHeader('Content-Type','application/javascript')
      res.end('const REVISION='+JSON.stringify(revision(version))+';const ASSETS='+JSON.stringify(Object.entries(data).map(([path,content])=>({path,hash:sha(content),bytes:Buffer.byteLength(content)})))+';\n'+workerSource)
      return
    }
    if(path === scopePath || path === scopePath+'index.html') {
      res.setHeader('Content-Type','text/html');res.end(data['index.html']);return
    }
    if(path === scopePath+'assets/lazy.js') {
      requests++
      res.setHeader('Content-Type','application/javascript');res.end(corrupt?'corrupted resource':data['assets/lazy.js']);return
    }
    res.statusCode=404;res.end('not found')
  })
  return {
    server,
    setVersion(next: number, bad = false) { version=next;corrupt=bad;requests=0 },
    get requests(){return requests},
  }
}
function listen(server: Server): Promise<string> {
  return new Promise((resolve,reject)=>{
    server.once('error',reject)
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address()
      if(!address||typeof address==='string')return reject(Error('No fixture port'))
      resolve('http://127.0.0.1:'+address.port+scopePath)
    })
  })
}
test('versioned worker rejects corrupted updates and activates a verified version only after old clients close',async({page,context})=>{
  const app=fixture()
  const url=await listen(app.server)
  const prefix='inftab-pwa:'+scopePath+':'
  try {
    await page.goto(url)
    await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'})})
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:20000}).toBe(true)
    await expect(page.locator('main')).toHaveText('Version 1')
    const cacheKeys=()=>page.evaluate(()=>caches.keys())
    expect(await cacheKeys()).toContain(prefix+revision(1))
    await page.evaluate(()=>caches.open('unrelated-cache'))
    // Observe the actual installing worker's terminal state instead of guessing from a delay.
    const update=()=>page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.getRegistration()
      if(!reg)throw Error('Missing registration')
      return new Promise<string>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('No update terminal state')),20000)
        function observe(worker: ServiceWorker | null){
          if(!worker)return
          const check=()=>{if(['installed','redundant','activated'].includes(worker!.state)){clearTimeout(timer);resolve(worker!.state)}}
          worker.addEventListener('statechange',check);check()
        }
        reg.addEventListener('updatefound',()=>observe(reg.installing),{once:true})
        void reg.update().then(()=>observe(reg.installing??reg.waiting)).catch(error=>{clearTimeout(timer);reject(error)})
      })
    })
    app.setVersion(2,true)
    expect(await update()).toBe('redundant')
    expect(app.requests).toBeGreaterThan(0)
    expect(await cacheKeys()).not.toContain(prefix+revision(2))
    expect(await cacheKeys()).toContain(prefix+revision(1))
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('main')).toHaveText('Version 1')
    expect(await page.evaluate(()=>fetch('./assets/lazy.js').then(r=>r.text()))).toBe('export default 1')
    await context.setOffline(false)
    app.setVersion(3)
    expect(await update()).toBe('installed')
    expect(await cacheKeys()).toContain(prefix+revision(3))
    const other=await context.newPage()
    await other.goto(url)
    await expect(other.locator('main')).toHaveText('Version 1')
    await other.close()
    await page.close()
    const next=await context.newPage()
    await next.goto(url)
    await expect.poll(()=>next.evaluate(async()=>{
      const reg=await navigator.serviceWorker.getRegistration()
      return !!navigator.serviceWorker.controller&&!reg?.waiting
    }),{timeout:20000}).toBe(true)
    await next.reload()
    await expect(next.locator('main')).toHaveText('Version 3')
    expect(await next.evaluate(()=>fetch('./assets/lazy.js').then(r=>r.text()))).toBe('export default 3')
    const keys=await next.evaluate(()=>caches.keys())
    expect(keys).toContain(prefix+revision(3))
    expect(keys).not.toContain(prefix+revision(1))
    expect(keys).toContain('unrelated-cache')
    await next.close()
  }finally{
    await context.setOffline(false)
    await new Promise<void>(resolve=>serverClose(app.server,resolve))
  }
})
function serverClose(server: Server,done:()=>void){server.close(()=>done());server.closeAllConnections()}
