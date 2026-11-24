/* Build-time REVISION and ASSETS are injected by build-pwa.mjs. */
const scope = new URL(self.registration.scope)
const prefix = 'inftab-pwa:' + scope.pathname + ':'
const cacheName = prefix + REVISION
let disabling=false
const ownedCache = key => key.startsWith(prefix) && /^[0-9a-f]{24}$/.test(key.slice(prefix.length))
const inScope = url => { const target = new URL(url); return target.origin === scope.origin && target.pathname.startsWith(scope.pathname) }
const shell = new URL('index.html',scope).href
const urls = new Set(ASSETS.map(([path]) => new URL(path,scope).href))
const digest = async bytes => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))))
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache = await caches.open(cacheName)
    try {
      // Verify every response before committing it: a missing lazy chunk must
      // not install an incomplete or mixed-version shell.
      for(let i=0;i<ASSETS.length;i+=8) {
        const results = await Promise.allSettled(ASSETS.slice(i,i+8).map(async ([path,hash])=>{
        const url=new URL(path,scope).href
        const response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'error'})
        if(!response.ok || await digest(await response.clone().arrayBuffer())!==hash) throw Error('Precache verification failed')
        await cache.put(url,response)
        }))
        if(results.some(result=>result.status==='rejected')) throw Error('Precache verification failed')
      }
    } catch(error) {
      await caches.delete(cacheName)
      throw error
    }
    // Deliberately no skipWaiting: active tabs retain their own build.
  })())
})
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()) if(ownedCache(key)&&key!==cacheName) await caches.delete(key)
    await self.clients.claim()
  })())
})
self.addEventListener('fetch',event=>{
  const request=event.request
  if(disabling||request.method!=='GET') return
  const url=new URL(request.url)
  if(url.origin!==scope.origin) return
  if(request.mode==='navigate' && (url.pathname===scope.pathname || url.pathname===new URL('index.html',scope).pathname)) {
    event.respondWith(caches.match(shell,{cacheName}).then(response=>response??fetch(request)))
    return
  }
  if(urls.has(url.href)) event.respondWith(caches.match(url.href,{cacheName}).then(response=>response??fetch(request)))
  // Never cache arbitrary URLs, user data, network API responses or search results.
})

self.addEventListener('message',event=>{
  const port=event.ports[0], source=event.source
  if(!port || !source?.url || !inScope(source.url)) return
  if(!['cache-info','disable'].includes(event.data?.type)) return
  event.waitUntil((async()=>{
    try{
      if(event.data.type==='cache-info'){
        const keys=await caches.keys()
        const cache=keys.includes(cacheName)?await caches.open(cacheName):null
        const present=new Set(cache?(await cache.keys()).map(request=>request.url):[])
        port.postMessage({ok:true,revision:REVISION,count:present.size,bytes:ASSETS.reduce((sum,[path,,bytes])=>sum+(present.has(new URL(path,scope).href)?bytes:0),0),versions:keys.filter(ownedCache).length})
        return
      }
      if(disabling) throw Error('正在清理离线缓存。')
      if(self.registration.waiting||self.registration.installing) throw Error('新版本正在更新，请关闭工作台标签页后重试。')
      disabling=true
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true})
      if(clients.some(client=>client.id!==source.id&&inScope(client.url))){disabling=false;throw Error('请先关闭其他工作台标签页，再停用并清理。')}
      if(self.registration.waiting||self.registration.installing){disabling=false;throw Error('新版本正在更新，请关闭工作台标签页后重试。')}
      if(!await self.registration.unregister()){disabling=false;throw Error('注销失败，请重新检查离线状态。')}
      for(const key of await caches.keys()) if(ownedCache(key)) await caches.delete(key)
      port.postMessage({ok:true})
    }catch(error){disabling=false;port.postMessage({ok:false,message:error.message||'离线缓存操作失败。'})}
  })())
})
