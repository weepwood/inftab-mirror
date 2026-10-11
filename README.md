# inftab-mirror

Infinity New Tab 的可维护前端重建。页面使用 Vue 3、TypeScript 和 Vite；原静态镜像保存在 `reference/legacy-mirror/`，作为视觉、资源和行为对照。

## 本地开发

需要 Node.js 20.19+、22.12+ 或 24+。

```sh
npm install
npm run dev
```

Vite 会在终端输出本地预览地址。生产构建和本地预览：

```sh
npm run build
npm run preview
```

Run the automated regression suite with:

```sh
npm test
```

Run the browser-level user-flow checks with:

```sh
npx playwright install chromium
npm run test:e2e
```

The end-to-end suite covers shortcut creation and persistence, keyboard launcher search, panel open/close, widget add/reorder/remove and persistence, settings persistence, and narrow-screen overflow. GitHub Actions runs both suites for pull requests and before publishing to Pages; browser reports and failure traces are retained as workflow artifacts.

GitHub Pages 使用 `dist/` 作为发布目录。首次部署前，在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。之后推送到 `main` 会自动构建并发布；也可以在 Actions 页面手动运行工作流。`vite.config.ts` 使用相对资源路径，支持部署在仓库子路径下。

同一个 dist 目录也可作为 Chrome Manifest V3 新标签页扩展加载：运行 npm run build，在 chrome://extensions 开启开发者模式后选择“加载已解压的扩展程序”，并选择 dist/。扩展仅请求天气 API 所需的两个主机权限；书签、剪贴板写入和浏览历史访问均为可选权限，只有用户主动使用相应功能时才会请求。浏览历史面板只搜索和打开记录，不删除或上传历史。快捷入口图标网址在扩展模式下直接作为图片加载，不申请任意网站访问权限。扩展与普通网站使用各自的浏览器存储空间，可通过 JSON 备份迁移设置。

## 项目结构

```text
src/
  components/       搜索栏、快捷入口、设置、首页小组件、书签、日历、待办、纪念日、笔记、天气面板
  composables/      本地工作区状态和浏览器存储
  data/             默认快捷入口、日历日期计算、搜索引擎、书签 API、搜索地址和外观选项
  plugins/          内置面板和首页小组件注册表、入口路由和数据适配器
  styles/           页面与响应式样式
  App.vue           页面状态和功能组合
  main.ts           应用入口
public/
  wallpapers/       本地壁纸
  inftab-icons/     旧镜像中的常用站点和内置图标
  search-engines/   搜索引擎标识
  windmill.svg      页面装饰图标
reference/
  legacy-mirror/    原始打包版镜像，仅用于对照
```

## 已实现

- 百度、Google、Bing、搜狗、360、Yahoo 和 DuckDuckGo 搜索；支持网页、图片、新闻、视频和地图分类
- 可添加最多 20 个自定义搜索引擎；HTTPS 查询模板会安全编码搜索词，并随本地数据一起备份和迁移
- 浏览器扩展可按需授权读取浏览器书签、筛选并将条目预填到首页快捷入口；网站版本会说明该能力仅在扩展中可用
- 浏览器扩展可按需授权搜索浏览历史；历史列表支持关键词筛选、显示访问时间，网站版本会说明该能力仅在扩展中可用
- 快捷入口的添加、编辑、删除、拖动排序和分页；支持右键菜单、触屏长按排序、左右滑动/触控板切页，以及微粒消散、光迹拖尾和平滑滑动三种翻页效果
- 可创建快捷入口文件夹，将多个已有入口收纳在一起；文件夹与入口共用拖动排序，并包含在 JSON 备份中
- 按 `/` 或 `Ctrl+K`（macOS 为 `⌘+K`）可快速聚焦网页搜索；按 `Ctrl+F`（macOS 为 `⌘+F`）可查找快捷入口，支持按名称和网址筛选
- 首页显示本地时间和日期，并可在设置中关闭；页面恢复到前台时会重新校准时钟
- 默认入口优先使用旧镜像保存的站点图标；自定义入口支持上传图片并压缩为 Base64 存入本机，离线可用（远程图标网址会在保存时尝试转存，遇到跨域限制时请上传图片）
- 首页内容会随宽度扩展到 1440px，并按窗口高度和当前入口数量自适应图标与行距，尽量让完整图标页、页码和底部信息同时可见
- 本地待办（新增、编辑、完成、删除、清除已完成）、笔记和离线四则计算器（支持括号、键盘输入与按键操作）
- 专注计时器支持 15、25、50 分钟专注时长；结束后按四轮节奏进入短休息或长休息，关闭面板和刷新页面后继续计时
- 首页可固定待办概览、纪念日倒计时和笔记预览小组件；支持拖动排序、键盘上下调整和单独移除，点击标题可直接打开对应面板；小组件配置纳入备份，并按需加载
- 可把天气、待办、日历等内置面板固定到常驻 Dock；切换入口页或刷新后仍可快速打开，Dock 顺序和设置随 JSON 备份迁移
- 可查看本地日期的月历，支持跨月导航、选择日期和一键返回今天；周一作为每周起始日
- 纪念日与倒计时（添加、编辑、删除；支持一次性日期、每年重复和过期日期计时，并纳入数据备份）
- 壁纸选择、浅色/深色/跟随系统主题、背景暗度、搜索栏显隐与宽高、搜索类型标签（默认隐藏）、图标大小/圆角、每页行列数、图标间距、搜索区与图标间距、翻页动画时长和悬停光晕强度均可在设置中调整
- 内置壁纸可按小时或天自动轮换；轮换进度保存在本地并纳入 JSON 备份，自定义背景启用期间暂停
- 可上传本地壁纸；图片会缩放并压缩为 WebP 后离线保存在本机，也可通过 JSON 备份迁移
- 天气城市搜索、当前天气和未来三日预报；城市由用户手动选择，不请求设备定位
- 天气、书签、设置、笔记、待办和纪念日面板按需加载，减少打开新标签页时的首屏 JavaScript 工作
- JSON 数据备份与迁移：导入前预览，可选择按 ID 合并或替换；首页小组件和排序随页面设置一并迁移
- 个人设置、快捷入口、待办、笔记和天气城市保存在当前浏览器的 `localStorage`

## 当前边界

此版本重建的是前端交互。原站账号、云同步、原站搜索建议/通知和浏览器扩展权限功能尚未接入。天气数据通过 Open-Meteo 的地理编码与天气预报 API 获取，服务不可用时天气面板会提示重试；其余个人数据只保存在本机浏览器，JSON 导入导出可用于手动迁移。

背景图库使用归档中的本地壁纸，并保留不依赖外部图片的渐变主题；当前快照只包含一张实际壁纸图片。新增内置图片前应确认来源许可，并将素材放入 `public/wallpapers/`。个人上传的壁纸只存于当前浏览器，不会发送到服务器。

新功能优先放在 `src/components/`、`src/data/` 或新的功能模块中，不直接修改 `reference/legacy-mirror/` 内的压缩构建文件。

内置工具面板通过 `src/plugins/registry.ts` 注册组件、标题、快捷入口路由、属性和事件适配器；首页小组件通过 `src/plugins/widgetRegistry.ts` 注册视图、上下文数据和关联面板。添加功能时应在对应注册表声明，并增加数据校验、备份兼容及用户交互测试。注册表目前只加载仓库内受信任的模块，不执行远程插件代码；面板与小组件都按需加载，避免增加首屏工作。

面板和小组件 ID 集中在 `src/plugins/ids.ts`，注册表通过 TypeScript 校验 ID 清单与实现是否齐全。新增内置面板或首页小组件的步骤、状态和测试要求见 [`docs/plugin-development.md`](docs/plugin-development.md)。
