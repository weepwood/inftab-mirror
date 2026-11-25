import { describe,expect,it } from 'vitest'
import { searchDesktopRecords } from './spotlight'
const fixture={items:[],workspaces:[{id:'w',name:'Alpha',itemIds:[]}],notes:[{id:'n',title:'Alpha note',body:'secret body',updatedAt:0}],todos:[{id:'t',title:'Alpha task',done:false}]}
describe('local spotlight',()=>{
 it('matches full width and ranks exact title first',()=>expect(searchDesktopRecords('ＡＬＰＨＡ',fixture)[0]?.id).toBe('record:workspace:w'))
 it('matches note contents without returning them',()=>expect(searchDesktopRecords('secret body',fixture)).toEqual([{id:'record:note:n',label:'Alpha note',detail:'笔记'}]))
 it('does not enumerate private records when query is blank',()=>expect(searchDesktopRecords(' ',fixture)).toEqual([]))
})
