import {expect,test} from '@playwright/test'
test('desktop mutations refuse a cooperating tab lock and persist before reporting success',async({page,context})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('inftab.desktop-mode.v1','true')
  localStorage.setItem('inftab.shortcuts.v1',JSON.stringify([{id:'lock-link',title:'Lock link',url:'https://example.com',mark:'L',color:'#5689aa'}]))
  localStorage.setItem('inftab.folders.v1',JSON.stringify([{id:'lock-folder',title:'Lock folder',shortcutIds:[],mark:'F',color:'#4176e8'}]))
  localStorage.setItem('inftab.home-workspaces.v1',JSON.stringify([{id:'default',name:'主页',itemIds:['lock-link','lock-folder']}]))
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Finder',exact:true}).click()
 const finder=page.getByRole('dialog',{name:'Finder 入口管理'})
 await finder.locator('[data-finder-id="lock-link"]').click()
 const other=await context.newPage()
 try{
  await other.goto('/')
  await other.evaluate(()=>{
   void navigator.locks.request('inftab-desktop-mutation-v1',async()=>{
    await new Promise<void>(resolve=>window.addEventListener('release-test-lock',()=>resolve(),{once:true}))
   })
  })
  await expect.poll(()=>other.evaluate(async()=>Boolean((await navigator.locks.query()).held?.some(l=>l.name==='inftab-desktop-mutation-v1')))).toBe(true)
  await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('lock-folder')
  await expect(page.getByRole('alert').filter({hasText:'另一个标签页正在执行桌面操作'})).toBeVisible()
  await expect(finder.locator('[data-finder-id="lock-link"]')).toBeVisible()
  await other.evaluate(()=>window.dispatchEvent(new Event('release-test-lock')))
  await expect.poll(()=>other.evaluate(async()=>Boolean((await navigator.locks.query()).held?.some(l=>l.name==='inftab-desktop-mutation-v1')))).toBe(false)
  await finder.getByRole('combobox',{name:'移动到文件夹'}).selectOption('lock-folder')
  await expect(finder.getByRole('button',{name:'撤销操作'})).toBeEnabled()
  expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('inftab.folders.v1')??'[]')[0]?.shortcutIds)).toEqual(['lock-link'])
 }finally{await other.close()}
})
