import type { EngineId, LauncherItem, Preferences, SearchMode, Shortcut } from '../types'

const base = import.meta.env.BASE_URL

export const defaultPreferences: Preferences = {
  engine: 'baidu',
  mode: 'html',
  wallpaper: `${base}wallpapers/forest.webp`,
  customWallpaper: '',
  shade: 0.2,
  iconSize: 76,
  columns: 6,
  showNames: true,
  iconRadius: 50,
}

export const engines: { id: EngineId; label: string; mark: string; color: string }[] = [
  { id: 'baidu', label: '百度', mark: 'du', color: '#2468f2' },
  { id: 'google', label: 'Google', mark: 'G', color: '#4285f4' },
  { id: 'bing', label: 'Bing', mark: 'b', color: '#087eaa' },
  { id: 'duckduckgo', label: 'DuckDuckGo', mark: 'D', color: '#de5833' },
]

export const searchModes: { id: SearchMode; label: string }[] = [
  { id: 'html', label: '网页' },
  { id: 'photos', label: '图片' },
  { id: 'news', label: '新闻' },
  { id: 'videos', label: '视频' },
  { id: 'map', label: '地图' },
]

export const defaultShortcuts: Shortcut[] = [
  { id: 'jd', title: '京东商城', url: 'https://www.jd.com/', color: '#e9232e', mark: 'JD' },
  { id: 'tmall', title: '天猫精选', url: 'https://www.tmall.com/', color: '#f40036', mark: '天猫' },
  { id: 'taobao', title: '爱淘宝', url: 'https://www.taobao.com/', color: '#f12b2f', mark: '淘' },
  { id: 'vip', title: '唯品会', url: 'https://www.vip.com/', color: '#df1688', mark: '唯品会' },
  { id: 'gaoding', title: '稿定设计', url: 'https://www.gaoding.com/', color: '#2255ec', mark: '稿' },
  { id: 'baidu', title: '百度', url: 'https://www.baidu.com/', color: '#2676ed', mark: '爪' },
  { id: 'lunwenmao', title: '论文猫', url: 'https://www.lunwenmao.com/', color: '#f6f7f8', mark: '猫' },
  { id: 'ctrip', title: '携程网', url: 'https://www.ctrip.com/', color: '#2478e8', mark: '海豚' },
  { id: 'deep-sider', title: 'DeepSider', url: 'https://www.deepsider.ai/', color: '#f4f8f5', mark: '◈' },
  { id: 'iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com/', color: '#54a90c', mark: 'iQIYI' },
  { id: 'fox', title: '狐猴', url: 'https://www.google.com/', color: '#06b8df', mark: '狐' },
  { id: 'games', title: 'Infinity Games', url: 'https://inftab.com/', color: '#f7f7f7', mark: '🎮' },
  { id: 'infinitytab', title: 'Infinitytab', url: 'https://inftab.com/', color: '#141414', mark: '∞' },
  { id: 'wallpapers', title: '壁纸库', url: 'https://inftab.com/', color: '#fff', mark: '▧' },
  { id: 'xiaomiyoupin', title: '小米有品', url: 'https://www.xiaomiyoupin.com/', color: '#ff6b19', mark: '有品' },
  { id: 'bilibili', title: '哔哩哔哩', url: 'https://www.bilibili.com/', color: '#f45a8d', mark: 'bili' },
  { id: 'zhihu', title: '知乎', url: 'https://www.zhihu.com/', color: '#1772f6', mark: '知' },
  { id: 'github', title: 'GitHub', url: 'https://github.com/', color: '#292d32', mark: 'GH' },
]

export const launcherItems: LauncherItem[] = [
  { id: 'weather', title: '天气', action: 'weather', color: '#36a9ef', mark: '☁' },
  { id: 'todos', title: '待办事项', action: 'todos', color: '#fff', mark: '✓' },
  { id: 'notes', title: '笔记', action: 'notes', color: '#fff', mark: '▮' },
  { id: 'settings', title: '设置', action: 'settings', color: '#fff', mark: '⚙' },
]

export const wallpaperChoices = [
  { label: '雾林', value: `${base}wallpapers/forest.webp`, preview: `url("${base}wallpapers/forest.webp")` },
  { label: '暮色', value: 'linear-gradient(135deg, #192a3a, #67526f 52%, #e0a777)', preview: 'linear-gradient(135deg, #192a3a, #67526f 52%, #e0a777)' },
  { label: '海面', value: 'linear-gradient(135deg, #0b3851, #178f9c 54%, #9ed7cb)', preview: 'linear-gradient(135deg, #0b3851, #178f9c 54%, #9ed7cb)' },
  { label: '暖沙', value: 'linear-gradient(135deg, #3d3028, #b17a53 55%, #e4c4a0)', preview: 'linear-gradient(135deg, #3d3028, #b17a53 55%, #e4c4a0)' },
]
