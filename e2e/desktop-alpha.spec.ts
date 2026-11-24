import { test, expect } from '@playwright/test'
test('desktop drag persists, viewport shrink preserves saved coordinates, classic mode survives', async ({page}) => {
  await page.setViewportSize({width:1280,height:900})
  await page.goto('/')
  await page.getByRole('button',{name:'桌面模式',exact:true}).click()
  const surface=page.locator('.desktop-surface')
  await expect(surface).toBeVisible()
  const icon=surface.locator('.desktop-icon').first()
  await expect(icon).toBeVisible()
  const id=await icon.getAttribute('data-item-id')
  const start=(await icon.boundingBox())!
  await page.mouse.move(start.x+40,start.y+40)
  await page.mouse.down()
  await page.mouse.move(start.x+240,start.y+424,{steps:12})
  await page.mouse.up()
  const read=()=>page.evaluate(id=> {
    return JSON.parse(localStorage.getItem('inftab.home-workspaces.v1') ?? '[]').find((w: {id:string})=>w.id==='default')?.desktop?.positions[id!] ?? null
  },id)
  await expect.poll(read).toEqual({x:192,y:384})
  const saved=await read()
  await page.reload()
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 192, 384)')
  await page.setViewportSize({width:280,height:700})
  await expect.poll(read).toEqual(saved)
  await page.setViewportSize({width:1280,height:720})
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 192, 384)')
  await page.getByRole('button',{name:'经典模式',exact:true}).click()
  await expect(page.locator('.shortcut-grid-wrap')).toBeVisible()
  await page.getByRole('button',{name:'桌面模式',exact:true}).click()
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 192, 384)')
})

test('workspace layouts are isolated and cancelled drags do not commit', async ({page})=>{
  await page.setViewportSize({width:1280,height:900})
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('desktop-seeded')) return
    sessionStorage.setItem('desktop-seeded','1')
    localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([
      {id:'default',name:'主页',itemIds:['weather'],desktop:{version:1,snap:true,positions:{weather:{x:288,y:288}}}},
      {id:'second',name:'专项工作区',itemIds:['weather'],desktop:{version:1,snap:false,positions:{weather:{x:480,y:192}}}},
    ]))
    localStorage.setItem('inftab.desktop-mode.v1','true')
  })
  await page.goto('/')
  const icon=page.locator('.desktop-icon[data-item-id="weather"]')
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 288, 288)')
  await page.getByRole('button',{name:'切换工作区，当前：主页'}).click()
  await page.getByRole('button',{name:'专项工作区',exact:true}).click()
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 480, 192)')
  const box=(await icon.boundingBox())!
  await page.mouse.move(box.x+40,box.y+40)
  await page.mouse.down()
  await page.mouse.move(box.x+140,box.y+140,{steps:8})
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 480, 192)')
  await page.getByRole('button',{name:'切换工作区，当前：专项工作区'}).click()
  await page.getByRole('button',{name:'主页',exact:true}).click()
  await expect(icon).toHaveCSS('transform','matrix(1, 0, 0, 1, 288, 288)')
  await page.screenshot({path:'test-results/desktop-alpha-full.png'})
})

for (const count of [50,200,1000]) {
  test('desktop synthetic workload '+count, async ({page},info)=>{
    await page.setViewportSize({width:1280,height:900})
    await page.addInitScript(count=>{
      const links=Array.from({length:Math.min(count,500)},(_,i)=>({id:'synthetic-link-'+i,title:'Link '+i,url:'https://example.com/'+i,color:'#537b9d',mark:'L'}))
      const folders=Array.from({length:Math.max(0,count-500)},(_,i)=>({id:'synthetic-folder-'+i,title:'Folder '+i,shortcutIds:[],color:'#5197c8',mark:'F'}))
      localStorage.setItem('inftab.shortcuts.v1',JSON.stringify(links))
      localStorage.setItem('inftab.folders.v1',JSON.stringify(folders))
      localStorage.setItem('inftab.desktop-mode.v1','true')
      localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([{id:'default',name:'主页',itemIds:[...links,...folders].map(i=>i.id),desktop:{version:1,snap:false,positions:Object.fromEntries([...links,...folders].map((item,i)=>[item.id,{x:(i%6)*192,y:Math.floor(i/6)*192}]))}}]))
    },count)
    await page.goto('/')
    await expect(page.locator('.desktop-icon[data-item-id^="synthetic-"]')).toHaveCount(count)
    const targetIndex=count===50?24:48
    const icon=page.locator('.desktop-icon[data-item-id="synthetic-link-'+targetIndex+'"]')
    await icon.scrollIntoViewIfNeeded()
    const box=(await icon.boundingBox())!
    await page.evaluate(()=>{
      const w=window as unknown as {desktopMetrics:{frames:number[];writes:number;writeMs:number;active:boolean}}
      const m=w.desktopMetrics={frames:[],writes:0,writeMs:0,active:true}
      const original=Storage.prototype.setItem
      Storage.prototype.setItem=function(key,value){const t=performance.now();original.call(this,key,value);if(key==='inftab.home-workspaces.v1'){m.writes++;m.writeMs+=performance.now()-t}}
      let last=performance.now()
      function frame(now:number){if(!m.active)return;m.frames.push(now-last);last=now;requestAnimationFrame(frame)}
      requestAnimationFrame(frame)
    })
    await page.mouse.move(box.x+40,box.y+40)
    await page.mouse.down()
    for(let i=0;i<30;i++){await page.mouse.move(box.x+40+(i%2?96:12),box.y+40);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>r())))}
    const during=await page.evaluate(()=>(window as unknown as {desktopMetrics:{writes:number}}).desktopMetrics.writes)
    expect(during).toBe(0)
    await page.mouse.up()
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {desktopMetrics:{writes:number}}).desktopMetrics.writes)).toBe(1)
    const metrics=await page.evaluate(()=>{const m=(window as unknown as {desktopMetrics:{frames:number[];writes:number;writeMs:number;active:boolean}}).desktopMetrics;m.active=false;const sorted=m.frames.sort((a,b)=>a-b);return {frames:sorted.length,p95:sorted[Math.floor(sorted.length*.95)],writes:m.writes,writeMs:m.writeMs}})
    console.log(JSON.stringify({count,...metrics}))
    await info.attach('desktop-metrics-'+count,{body:JSON.stringify({count,...metrics}),contentType:'application/json'})
    await info.attach('desktop-'+count,{body:await page.screenshot(),contentType:'image/png'})
  })
}

test('desktop built-in icons remain visible', async ({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'桌面模式',exact:true}).click()
  const builtin=page.locator('.desktop-symbol.builtin')
  await expect(builtin.first()).toBeVisible()
  expect(await builtin.count()).toBeGreaterThan(5)
  expect(await builtin.locator('svg').count()).toBe(await builtin.count())
  await page.screenshot({path:'test-results/desktop-alpha-icons.png'})
})
