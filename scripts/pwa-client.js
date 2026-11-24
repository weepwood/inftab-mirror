(() => {
  if (!['http:','https:'].includes(location.protocol) || !isSecureContext || !('serviceWorker' in navigator)) return
  const base = new URL('./',document.currentScript.src)
  const key = 'inftab.pwa.enabled.v1'
  const workerUrl = new URL('sw.js',base).href
  const controlled = () => navigator.serviceWorker.controller?.scriptURL === workerUrl
  const owned = candidate => candidate?.scope === base.href && [candidate.active,candidate.waiting,candidate.installing].some(worker=>worker?.scriptURL===workerUrl)
  const manifest = document.createElement('link')
  manifest.rel='manifest'; manifest.href=new URL('app.webmanifest',base).href
  document.head.append(manifest)
  const css=document.createElement('link')
  css.rel='stylesheet'; css.href=new URL('pwa.css',base).href
  document.head.append(css)
  const root=document.createElement('aside')
  root.className='inftab-pwa-control'
  const button=document.createElement('button')
  button.type='button'; button.textContent='启用离线工作台'
  const install=document.createElement('button')
  install.type='button'; install.textContent='安装应用'; install.hidden=true
  const status=document.createElement('span')
  status.setAttribute('role','status'); status.className='pwa-status'
  root.append(button,install,status); document.body.append(root)
  let registration, prompt, busy=false
  function enabled(){try{return localStorage.getItem(key)==='1'}catch{return false}}
  function remember(value){try{if(value)localStorage.setItem(key,'1');else localStorage.removeItem(key)}catch{}}
  function render(){
    if(busy)return
    const ready=controlled()
    button.textContent=ready?'停用离线工作台':'启用离线工作台'
    status.textContent=registration?.waiting?'新版本已缓存，关闭所有工作台标签页后更新。':ready?(navigator.onLine?'离线资源已就绪':'离线模式 · 本地功能可用'):''
  }
  function observe(candidate){
    registration=candidate
    candidate.addEventListener('updatefound',()=>candidate.installing?.addEventListener('statechange',render))
    candidate.installing?.addEventListener('statechange',render)
    candidate.waiting?.addEventListener('statechange',render)
  }
  async function enable(){
    if(busy)return
    busy=true;button.disabled=true;status.textContent='正在准备离线资源…'
    try {
      const existing=await navigator.serviceWorker.getRegistration(base.href)
      if(existing?.scope===base.href && !owned(existing)) throw Error('当前路径已有其他离线工作线程。')
      if(owned(existing)&&existing.active){observe(existing);remember(true);busy=false;render();if(navigator.onLine)void existing.update().catch(()=>{});return}
      registration=await navigator.serviceWorker.register(workerUrl,{scope:base.href,updateViaCache:'none'})
      const worker=registration.installing
      if(worker) await new Promise((resolve,reject)=>{
        const check=()=>{if(worker.state==='installed'||worker.state==='activated')resolve();if(worker.state==='redundant')reject(Error('离线资源校验失败，请重试。'))}
        worker.addEventListener('statechange',check);check()
      })
      remember(true)
      observe(registration)
      if(controlled()&&navigator.onLine) void registration.update().catch(()=>{})
      busy=false;render()
      if(!controlled()) status.textContent='资源已缓存，首次控制页面后即可离线。'
    }catch(error){busy=false;status.textContent='离线资源准备失败，可重试。';remember(false)}
    finally{button.disabled=false}
  }
  button.addEventListener('click',async()=>{
    if(controlled() || owned(registration)&&registration.active){
      if(!navigator.onLine){status.textContent='请联网后停用离线模式。';return}
      if(!confirm('停用离线工作台？建议先关闭其他工作台标签页。不会删除用户数据。'))return
      const current=registration??await navigator.serviceWorker.getRegistration(base.href)
      if(owned(current))await current.unregister()
      remember(false);status.textContent='已停止注册，刷新页面后生效。';button.disabled=true
      return
    }
    void enable()
  })
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();prompt=event;install.hidden=false
  })
  install.addEventListener('click',async()=>{
    if(!prompt)return
    const pending=prompt;prompt=undefined;install.hidden=true
    await pending.prompt()
  })
  navigator.serviceWorker.addEventListener('controllerchange',render)
  window.addEventListener('online',render);window.addEventListener('offline',render)
  window.addEventListener('appinstalled',()=>{install.hidden=true;void enable()})
  if(controlled()){
    void navigator.serviceWorker.getRegistration(base.href).then(value=>{if(owned(value)){observe(value);if(navigator.onLine)void value.update().catch(()=>{})}render()}).catch(render)
  }else if(enabled()&&navigator.onLine)void enable()
  else render()
})()
