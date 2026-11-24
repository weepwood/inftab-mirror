# Inftab V2.0 Desktop Edition 设计与实施规范

状态：方案待验证；V1.8.0 正式 Release 公开并核验前不合入任何 V2 运行时代码。保留经典模式及全部用户数据。目标为新标签页内的桌面工作台，不是完整 OS 或浏览器内核。

## 1. 开源源码审计（2026-11-24）

| 项目 | 许可证（仓库） | 参考 |
|---|---|---|
| https://github.com/qentrah/desktop-new-tab | MIT | Desktop.jsx、DesktopIcon.jsx、DesktopContext.jsx、db/repos.js：独立位置、桌面/文件夹关系、Finder 窗口与本地存储 |
| https://github.com/DustinBrett/daedalOS | MIT | components/system/Files/FileManager/useDraggableEntries.ts、useFileDrop.ts：多选、拖拽、位置保存与目录投放 |
| https://github.com/Thanas-R/Thanas-OS | MIT | src/components/macos/Window.tsx：窗口位置/尺寸/焦点、标题栏和边界约束 |
| https://github.com/junglecola001/glassdesk | MIT | src/stores/desktop-store.ts：书签、桌面隔离、组件和工作区关系 |
| https://github.com/taye/interact.js | MIT | 可自由拖动、resize、dropzone、snap/restrict；首选隔离原型，禁止重写指针物理引擎 |
| https://github.com/Surdeddd/wmkit | MIT | Headless窗口管理备选；需实测维护、API、焦点、Vue生命周期及包体积后再决定 |

以上已检查四个参考项目相关源码、仓库许可证；尚未运行它们的完整应用，也未复制代码/资源。React 代码不直接移植。第三方资产、商标、字体及依赖单独核验；使用现有可授权图标、系统字体和自有壁纸，不打包 Apple 专有资源。

## 2. 产品与视觉

- 默认新安装可选择桌面模式；升级保留经典分页模式，明确选择迁移，可随时切回。经典模式仍用 Swiper。
- 桌面 Shell：顶部低高度菜单栏（当前应用/空间、可用浏览器操作、时间）、壁纸、自由图标/文件夹和小组件层、窗口层、底部玻璃 Dock、Spotlight 覆盖层。
- 原始图标 ID、URL、标题、标签、图标、顺序及工作区关系不变。桌面默认右上角列式排列，可自由放置，提供可选吸附、整理、按名称/类型排序、改变大小。
- 单击选中、双击打开（允许单击打开偏好）、Cmd/Ctrl 多选、Shift 范围选择、框选、拖入文件夹/跨空间、F2/Enter 重命名可配置；键盘可完成同等移动操作。右键桌面创建链接/文件夹、整理/设置；右键项目打开/移入/删除/固定Dock。
- Finder 风格资源管理器：侧栏、路径面包屑、网格/列表、搜索、嵌套目录。复用现有快捷入口编辑、书签导入和搜索。
- 窗口：关闭、最小化、最大化/还原、拖动、边角缩放、聚焦提升、独立滚动；Dock 展示运行中应用。先支持 Finder 和已有工具面板；不假装真实系统 Wi-Fi/蓝牙/电源状态。小屏为响应式列表/单窗口而非强行多窗。

## 3. 架构与边界

Vue 3 + TypeScript + Vite + 现有 CSS/tokens/插件注册体系。
新增 src/components/desktop/{DesktopShell,DesktopSurface,DesktopIcon,DesktopFolder,DesktopMenuBar,WindowLayer,DesktopWindow,FinderWindow,SelectionLayer}.vue；复用 HomeDock、HomeWorkspaceTabs、CommandPalette、ShortcutContextMenu、现有工具组件。窗口的组件实例和 focus/z-order 是业务状态，不重复实现拖动/缩放算法。可访问菜单评估现有组件或 Reka UI，只在验证收益后引入。
独立 desktop chunk；经典模式不加载桌面专属依赖，桌面模式不加载经典 Swiper 轨道（除非用户切换）。interact.js 按模块实测，dragMove 仅更新拖动预览 transform，dragEnd 一次提交；窗口位置同理。无全局逐帧 Vue store 写入，无每图标独立全局监听器；卸载解除交互、监听器与临时层。只使用成熟库实现指针、拖放、吸附、缩放，应用层仅实现业务规则、选择和数据提交。

## 4. 数据与迁移

当前 Shortcut 已有 id/title/url/color/mark/icon/tags；ShortcutFolder 为 id/title/shortcutIds/color/mark，尚无嵌套 parent；LauncherItem 聚合 shortcut/folder/action；Preferences 有主题/壁纸/网格/Dock/小组件。现有 src/data/homeWorkspaces.ts、workspaceOwnership.ts、workspaceLayout.ts、src/composables/useLocalWorkspace.ts、workspaceLauncher.ts、workspaceBackup.ts 需继续兼容。workspaceJournal.ts 是独立 IndexedDB CAS 原型，不视为已上线事务。

新布局独立版本化，示意（最终字段以测试后的 schema 为准）：
- DesktopLayoutV2 {schemaVersion:2, revision, workspaces: Record<workspaceId, DesktopSpace>}
- DesktopSpace {placements: Record<itemId, Placement>, snap, referenceViewport:{width,height}, folderMembership: Record<itemId,parentId|null>}
- Placement {x,y,anchor:'top-left'|'top-right', order?, lastModified?}，CSS逻辑像素，明确基准；缩小视口仅计算可见位置，不覆盖原始坐标，放大恢复；大桌面溢出通过滚动/备用整理访问。
- WindowState {id,appId,workspaceId,entityId?,rect,restoreRect,mode,zIndex}，窗口会话与持久布局分离。文件夹引用关系单一权威；一期只映射现有一级文件夹，嵌套待事务与兼容验收；禁止循环、孤儿、重复归属。嵌套回退经典模式需递归可读或无损平铺视图，不删除数据。
- 迁移：先备份并校验 → 按工作区及旧 launcher 顺序确定性生成位置 → 预览 → 独立提交 V2 布局 → 重载校验，失败完整回退；不删除旧键、不改变原有 ID、幂等、跨标签 revision/CAS。备份格式明确版本，兼容 V1 导入；V2 含嵌套时导出 V1 需明确降级规则与提示，严禁静默丢失。
- 先验证已有 workspaceJournal CAS/失败恢复，正式启用时使用单事务快照，避免直接迁移到参考项目 SQLite WASM 或强制新存储体系。配额/中断/冲突必须显式处理。

## 5. 浏览器与安全

普通 URL 默认按现有偏好在真实浏览器标签页打开。内部窗口仅承载项目自有工具；外部 iframe 受 CSP frame-ancestors/X-Frame-Options、跨域及登录限制，不绕过或搭代理。浏览器标签/书签/历史等仅在 MV3 支持并由用户授权时启用；网站版能力降级。外部 URL 协议校验、noopener/noreferrer、导入限制、无新增必选权限、无云端同步默认开启。不要实现假的系统控制中心、真正磁盘浏览、终端或浏览器内核。

## 6. 实施顺序与质量门禁

P0 发布：#33 V1.8.0 全量 Release validation，main相同提交通过后两个ZIP、SHA256、Tag/Release核实，保持v1.7.0。之后独立worktree、分阶段PR。
P0 隔离原型：Interact.js与备选窗口库比较；50/200/1000图标、单选/多选、自由位置与文件夹投放、窗口移动缩放；实际Chrome/Edge/Firefox/WebKit，记录帧轨迹、资源体积与许可证；不得恢复旧自研翻页物理。选型门禁通过后固定版本及lock。
P0 桌面基础：新Shell及经典/桌面路由、坐标模型、单项拖拽和保存、布局回退；不动原有数据。
P0 文件夹/选择：Finder、拖入移出、多选框选、键盘、冲突与事务、备份恢复。
P1 窗口体系：自有工具窗口、Dock运行状态、焦点、最大化还原、窄屏降级。
P1 空间/视觉：工作区映射、独立壁纸布局、Spotlight、主题/菜单栏、移动端、真实截图。
P1 完整验收：独立桌面包体积预算先实测再经用户确认；原经典非Swiper156/入口60.5/Swiper30/CSS64KiB、PWA保持；新增分包模块归属门禁，不将业务代码藏进依赖预算。记录实际初次打开请求体积及加载时间，桌面模式不下载无关工具。
建议性能目标（不是实测）：普通60Hz环境连续拖动P95≤20ms、无空白/跳变、持久化不在每帧、200图标可用，1000图标按视口裁剪需实测；120/600秒多轮GC、DOM/监听器/Detached DOM趋势、卸载切换无残留。Chrome/Edge正式及MV3/PWA，Firefox/WebKit独立验收；实际鼠标/触控板反馈。对照macOS行为，不以静态截图替代真实交互验收。
P2 V2.0正式发布：用户体验确认、完整CI、迁移/降级测试、真实视频截图、Tag/Release与产物校验。每阶段中文commit、AGENTS.md交接、日常快速检查/高风险专项/发布完整验收。

不在V1.8发布前修改运行时代码。此文件为设计分支，不是已实现功能清单。
