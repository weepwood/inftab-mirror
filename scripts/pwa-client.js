(() => {
  if (!['http:','https:'].includes(location.protocol) || !isSecureContext || !('serviceWorker' in navigator)) return
  const base = new URL('./',document.currentScript.src)
  const key = 'inftab.pwa.enabled.v1'
  const workerUrl = new URL('sw.js',base).href
  const controlled = () => navigator.serviceWorker.controller?.scriptURL === workerUrl
  const owned = candidate => candidate?.scope === base.href && [candidate.active,candidate.waiting,candidate.installing].some(worker=>worker?.scriptURL===workerUrl)
  const root=document.createElement('aside')
  root.className='inftab-pwa-control'
  const button=document.createElement('button')
  button.type='button'; button.textContent='启用离线工作台'
  const install=document.createElement('button')
  install.type='button'; install.textContent='安装应用'; install.hidden=true
  const details=document.createElement('details')
  details.className='pwa-details'; details.hidden=true
  const summary=document.createElement('summary'); summary.textContent='离线管理'
  const info=document.createElement('p'); info.className='pwa-info'
  const check=document.createElement('button'); check.type='button';check.textContent='检查更新'
  const inspect=document.createElement('button');inspect.type='button';inspect.textContent='刷新缓存信息'
  const installHelp=document.createElement('p');installHelp.textContent='安装：Chrome/Edge 地址栏或菜单 → 安装应用；iOS Safari 分享 → 添加到主屏幕。'
  const help=document.createElement('p');help.textContent='更新需关闭全部工作台标签页再打开。离线可用本地工具，天气、搜索等网络功能需联网。'
  details.append(summary,info,check,inspect,help,installHelp)
  const status=document.createElement('span')
  status.setAttribute('role','status'); status.className='pwa-status'
  root.append(button,install,details,status); document.body.append(root)
  let registration, prompt=window.__inftabInstallPrompt, busy=false, stopped=false, updateFailed=false
  delete window.__inftabInstallPrompt
  install.hidden=!prompt
  const requestWorker=type=>new Promise((resolve,reject)=>{
    if(!controlled())return reject(Error('离线工作线程尚未就绪。'))
    const channel=new MessageChannel()
    const timer=setTimeout(()=>{channel.port1.close();reject(Error('离线管理响应超时。'))},5000)
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve(event.data):reject(Error(event.data?.message||'操作失败。'))}
    navigator.serviceWorker.controller.postMessage({type},[channel.port2])
  })
  async function refreshInfo(){
    try{const data=await requestWorker('cache-info');info.textContent='版本 '+data.revision.slice(0,8)+' · '+data.count+'/'+(data.expected??data.count)+' 个资源 · '+(data.bytes/1048576).toFixed(2)+' MiB · '+data.versions+' 份版本缓存'+(data.count<data.expected?' · 缓存缺失，建议联网清理后重新启用':'')}catch(error){info.textContent=error.message}
  }
  details.addEventListener('toggle',()=>{if(details.open)void refreshInfo()})
  inspect.addEventListener('click',refreshInfo)
  check.addEventListener('click',async()=>{
    if(!navigator.onLine){status.textContent='当前离线，联网后再检查。';return}
    if(!owned(registration)){status.textContent='离线工作线程尚未就绪。';return}
    check.disabled=true;updateFailed=false
    try{await registration.update();status.textContent=registration.waiting?'新版本已缓存，关闭所有工作台标签页后更新。':registration.installing?'正在下载并验证新版本…':'暂未检测到新版本。'}catch{status.textContent='更新检查失败，当前缓存仍可使用。'}finally{check.disabled=false}
  })
  function enabled(){try{return localStorage.getItem(key)==='1'}catch{return false}}
  function remember(value){try{if(value)localStorage.setItem(key,'1');else localStorage.removeItem(key)}catch{}}
  function render(){
    if(busy||stopped)return
    const ready=controlled()
    details.hidden=!ready && !registration
    check.disabled=!navigator.onLine || !ready
    if(ready&&details.open)void refreshInfo()
    button.textContent=ready?'停用并清理离线缓存':'启用离线工作台'
    status.textContent=ready&&!navigator.onLine?'离线模式 · 本地功能可用':registration?.waiting?'新版本已缓存，关闭所有工作台标签页后更新。':registration?.installing?'正在下载并验证新版本…':ready?(updateFailed?'更新失败，当前缓存仍可使用。':'离线资源已就绪'):''
  }
  function observe(candidate){
    registration=candidate
    const observeWorker=()=>{
      const worker=candidate.installing
      if(!worker)return
      updateFailed=false
      worker.addEventListener('statechange',()=>{if(worker.state==='redundant'&&controlled())updateFailed=true;render()})
      render()
    }
    candidate.onupdatefound=observeWorker
    observeWorker()
    candidate.waiting?.addEventListener('statechange',render)
  }
  async function enable(){
    if(busy)return
    if(!navigator.onLine){status.textContent='请联网后启用离线工作台。';return}
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
      if(!confirm('停用并清理当前工作台的离线资源？不会删除笔记、待办、设置或本地恢复点。'))return
      busy=true;button.disabled=true
      try{await requestWorker('disable');remember(false);stopped=true;details.hidden=true;status.textContent='已清理离线缓存，请刷新页面。';button.textContent='离线缓存已清理'}catch(error){status.textContent=error.message;button.disabled=false}finally{busy=false}
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
    try{await pending.prompt()}catch{status.textContent='可尝试通过浏览器菜单安装应用。'}
  })
  navigator.serviceWorker.addEventListener('controllerchange',render)
  window.addEventListener('online',()=>{render();if(!stopped&&owned(registration))void registration.update().catch(()=>{})});window.addEventListener('offline',render)
  window.addEventListener('appinstalled',()=>{prompt=undefined;install.hidden=true;if(!controlled())void enable()})
  if(controlled()){
    void navigator.serviceWorker.getRegistration(base.href).then(value=>{if(owned(value)){observe(value);if(navigator.onLine)void value.update().catch(()=>{})}render()}).catch(render)
  }else if(enabled()&&navigator.onLine)void enable()
  else render()
})()
