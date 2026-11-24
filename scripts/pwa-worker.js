/* Build-time REVISION and ASSETS are injected by build-pwa.mjs. */
const scope = new URL(self.registration.scope)
const prefix = 'inftab-pwa:' + scope.pathname + ':'
const cacheName = prefix + REVISION
const shell = new URL('index.html',scope).href
const urls = new Set(ASSETS.map(asset => new URL(asset.path,scope).href))
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache = await caches.open(cacheName)
    try {
      // Verify every response before committing it: a missing lazy chunk must
      // not install an incomplete or mixed-version shell.
      for(let i=0;i<ASSETS.length;i+=8) await Promise.all(ASSETS.slice(i,i+8).map(async asset=>{
        const url=new URL(asset.path,scope).href
        const response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'error'})
        if(!response.ok || await digest(await response.clone().arrayBuffer())!==asset.hash) throw Error('Precache verification failed')
        await cache.put(url,response)
      }))
    } catch(error) {
      await caches.delete(cacheName)
      throw error
    }
    // Deliberately no skipWaiting: active tabs retain their own build.
  })())
})
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()) if(key.startsWith(prefix)&&key!==cacheName) await caches.delete(key)
    await self.clients.claim()
  })())
})
self.addEventListener('fetch',event=>{
  const request=event.request
  if(request.method!=='GET') return
  const url=new URL(request.url)
  if(url.origin!==scope.origin) return
  if(request.mode==='navigate' && (url.pathname===scope.pathname || url.pathname===new URL('index.html',scope).pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache=>(await cache.match(shell))??fetch(request)))
    return
  }
  if(urls.has(url.href)) event.respondWith(caches.open(cacheName).then(async cache=>(await cache.match(url.href))??fetch(request)))
  // Never cache arbitrary URLs, user data, network API responses or search results.
})
