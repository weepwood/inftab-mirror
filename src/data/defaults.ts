import type { EngineId, LauncherItem, Preferences, SearchMode, Shortcut } from '../types'

const base = import.meta.env.BASE_URL

export const defaultPreferences: Preferences = {
  themeMode: 'light',
  hiddenLauncherIds: [],
  dockItemIds: [],
  homeWidgetIds: [],
  homeWidgetSizes: {
    'todo-summary': 'standard',
    'countdown-summary': 'standard',
    'notes-summary': 'standard',
    'calendar-summary': 'standard',
    'weather-summary': 'standard',
    'focus-timer-summary': 'standard',
  },
  engine: 'baidu',
  mode: 'html',
  visibleSearchModes: [],
  showSearchBar: true,
  showClock: true,
  wallpaper: `${base}wallpapers/forest.webp`,
  customWallpaper: '',
  wallpaperRotation: 'off',
  wallpaperRotationLastAt: 0,
  shade: 0.2,
  iconSize: 96,
  columns: 6,
  rows: 3,
  gridGapX: 18,
  gridGapY: 30,
  searchWidth: 548,
  searchHeight: 54,
  gridTopGap: 50,
  pageTransitionMs: 620,
  pageTransitionEffect: 'particles',
  hoverGlow: 100,
  showNames: true,
  iconRadius: 50,
}

export const engines: { id: EngineId; label: string; mark: string; color: string; logo: string }[] = [
  { id: 'baidu', label: 'Baidu', mark: 'B', color: '#2468f2', logo: 'baidu.png' },
  { id: 'google', label: 'Google', mark: 'G', color: '#4285f4', logo: 'google.png' },
  { id: 'bing', label: 'Bing', mark: 'b', color: '#087eaa', logo: 'bing_new.png' },
  { id: 'sogou', label: 'Sogou', mark: 'S', color: '#5b7ee5', logo: 'sougou.png' },
  { id: '360', label: '360 Search', mark: '360', color: '#20a96b', logo: '360.png' },
  { id: 'yahoo', label: 'Yahoo', mark: 'Y', color: '#673ab7', logo: 'yahoo.png' },
  { id: 'duckduckgo', label: 'DuckDuckGo', mark: 'D', color: '#de5833', logo: 'duckduckgo.png' },
]

export const searchModes: { id: SearchMode; label: string }[] = [
  { id: 'html', label: '网页' },
  { id: 'photos', label: '图片' },
  { id: 'news', label: '新闻' },
  { id: 'videos', label: '视频' },
  { id: 'map', label: '地图' },
]

export const defaultShortcuts: Shortcut[] = [
  { id: 'jd', title: '京东商城', url: 'https://www.jd.com/', color: '#e9232e', mark: 'JD', icon: 'cee009549b352def723ba09d6da4b742.png' },
  { id: 'tmall', title: '天猫精选', url: 'https://www.tmall.com/', color: '#f40036', mark: '天猫', icon: '2f301c86bb2d0efeec3d49930147157f.png' },
  { id: 'taobao', title: '爱淘宝', url: 'https://www.taobao.com/', color: '#f12b2f', mark: '淘', icon: '346647fb95fbac4d303c93fa0a4936d3.png' },
  { id: 'vip', title: '唯品会', url: 'https://www.vip.com/', color: '#df1688', mark: '唯品会', icon: '150127100741.png.png' },
  { id: 'gaoding', title: '稿定设计', url: 'https://www.gaoding.com/', color: '#2255ec', mark: '稿', icon: 'f0b90e0f436466b121ebcc46297cbfc1.png' },
  { id: 'baidu', title: '百度', url: 'https://www.baidu.com/', color: '#2676ed', mark: '爪', icon: 'c9f7546ad597dd7fb53e8129b6c07877.png' },
  { id: 'lunwenmao', title: '论文猫', url: 'https://www.lunwenmao.com/', color: '#f6f7f8', mark: '猫', icon: 'ebd5cc9193bde437e76de2ca1abd2121.png' },
  { id: 'ctrip', title: '携程网', url: 'https://www.ctrip.com/', color: '#2478e8', mark: '海豚', icon: '1502895222082.png' },
  { id: 'deep-sider', title: 'DeepSider', url: 'https://www.deepsider.ai/', color: '#f4f8f5', mark: '◈', icon: 'dbd6895d645eceb05cbcc5926952c505.png' },
  { id: 'iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com/', color: '#54a90c', mark: 'iQIYI', icon: '226c6aff617dbc253ce26d23be07c446.png' },
  { id: 'fox', title: '狐猴', url: 'https://www.google.com/', color: '#06b8df', mark: '狐', icon: '24f02a8178e6236d22dc563857bf32f8.png' },
  { id: 'games', title: 'Infinity Games', url: 'https://inftab.com/', color: '#f7f7f7', mark: '🎮', icon: '5001b4d70b1c62f14859b51a6e8abd6f.png' },
  { id: 'infinitytab', title: 'Infinitytab', url: 'https://inftab.com/', color: '#141414', mark: '∞', icon: 'bc545d7b32d3dc84c3041ca092fb2689.png' },
  { id: 'wallpapers', title: '壁纸库', url: 'https://inftab.com/', color: '#fff', mark: '▧', icon: '76e8e8a1cb47ef88dc9faaf52167aa9a.png' },
  { id: 'xiaomiyoupin', title: '小米有品', url: 'https://www.xiaomiyoupin.com/', color: '#ff6b19', mark: '有品' },
  { id: 'bilibili', title: '哔哩哔哩', url: 'https://www.bilibili.com/', color: '#00a1d6', mark: 'bili', icon: 'd8b62f4d64bda8800b1c788cd5ba3c68.png' },
  { id: 'zhihu', title: '知乎', url: 'https://www.zhihu.com/', color: '#1772f6', mark: '知', icon: '2b89ebe968d8cafe77a5c587daa79c7f.png' },
  { id: 'github', title: 'GitHub', url: 'https://github.com/', color: '#292d32', mark: 'GH', icon: 'a23b4cf17327527ae66aad5d13f059da.png' },
]

export const launcherItems: LauncherItem[] = [
  { id: 'weather', title: '天气', action: 'weather', color: '#36b3ff', mark: '☁', icon: 'weather-default.png' },
  { id: 'countdowns', title: '纪念日', action: 'countdowns', color: '#fff', mark: '🎉' },
  { id: 'todos', title: '待办事项', action: 'todos', color: '#fff', mark: '✓', icon: '6e49210c084629259f22609980c48ecf.png' },
  { id: 'focus-timer', title: '专注计时', action: 'focus-timer', color: '#fff', mark: '⏱' },
  { id: 'notes', title: '笔记', action: 'notes', color: '#fff', mark: '▮', icon: '006b88c07a2e87d5a61f3c969a70575c.png' },
  { id: 'settings', title: '设置', action: 'settings', color: '#fff', mark: '⚙', icon: '9622b98e90dd4f107d23481566095b34.png' },
  { id: 'bookmarks', title: '书签', action: 'bookmarks', color: '#fff', mark: '☆' },
  { id: 'history', title: '浏览历史', action: 'history', color: '#fff', mark: '↶' },
  { id: 'calculator', title: '计算器', action: 'calculator', color: '#fff', mark: '＋' },
  { id: 'calendar', title: '日历', action: 'calendar', color: '#fff', mark: '日' },
]

export const defaultLauncherOrder = [
  ...launcherItems.map((item) => item.id),
  ...defaultShortcuts.map((shortcut) => shortcut.id),
]

export const wallpaperChoices = [
  { label: '雾林', value: `${base}wallpapers/forest.webp`, preview: `url("${base}wallpapers/forest.webp")` },
  { label: '暮色', value: 'linear-gradient(135deg, #192a3a, #67526f 52%, #e0a777)', preview: 'linear-gradient(135deg, #192a3a, #67526f 52%, #e0a777)' },
  { label: '海面', value: 'linear-gradient(135deg, #0b3851, #178f9c 54%, #9ed7cb)', preview: 'linear-gradient(135deg, #0b3851, #178f9c 54%, #9ed7cb)' },
  { label: '暖沙', value: 'linear-gradient(135deg, #3d3028, #b17a53 55%, #e4c4a0)', preview: 'linear-gradient(135deg, #3d3028, #b17a53 55%, #e4c4a0)' },
]
