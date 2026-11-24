export const homeCommands = [
  { id: 'find', label: '查找快捷入口', detail: '搜索', keywords: 'find search' },
  { id: 'add', label: '新建快捷入口', detail: '入口', keywords: 'add shortcut' },
  { id: 'panel:settings', label: '打开设置', detail: '设置', keywords: 'settings preferences' },
  { id: 'panel:todos', label: '待办事项', detail: '工具', keywords: 'todo tasks' },
  { id: 'panel:notes', label: '笔记', detail: '工具', keywords: 'notes' },
  { id: 'panel:habits', label: '习惯', detail: '工具', keywords: 'habit' },
  { id: 'panel:focus-timer', label: '专注计时', detail: '工具', keywords: 'focus timer' },
  { id: 'panel:weather', label: '天气', detail: '工具', keywords: 'weather' },
  { id: 'panel:calendar', label: '日历', detail: '工具', keywords: 'calendar' },
  { id: 'panel:countdowns', label: '纪念日', detail: '工具', keywords: 'countdown' },
  { id: 'panel:calculator', label: '计算器', detail: '工具', keywords: 'calculator' },
  { id: 'panel:bookmarks', label: '书签', detail: '工具', keywords: 'bookmark' },
  { id: 'panel:history', label: '历史记录', detail: '工具', keywords: 'history' },
  { id: 'light', label: '切换浅色主题', detail: '外观', keywords: 'light theme' },
  { id: 'dark', label: '切换深色主题', detail: '外观', keywords: 'dark theme' },
  { id: 'system', label: '主题跟随系统', detail: '外观', keywords: 'system theme' },
  { id: 'minimal', label: '切换极简模式', detail: '视图', keywords: 'minimal' },
  { id: 'home', label: '返回第一页', detail: '视图', keywords: 'home' },
] as const

export function filterCommands(query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return homeCommands.filter(command => terms.every(term => (command.label + ' ' + command.detail + ' ' + command.keywords).toLocaleLowerCase().includes(term)))
}
