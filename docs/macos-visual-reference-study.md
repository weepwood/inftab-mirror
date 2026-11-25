# macOS 桌面视觉重构研究（2026-11-26）
## 源码参考
- PuruVJ/macos-web（MIT）：https://github.com/PuruVJ/macos-web ，实际核查 Dock.svelte、MenuBar.svelte，分层容器、底部独立玻璃、菜单激活时跨项滑动。
- Renovamen/playground-macos（MIT）：https://github.com/Renovamen/playground-macos ，核查 AppWindow.tsx，交通灯及窗口几何管理分离。
- Thanas-R/Thanas-OS（MIT）：https://github.com/Thanas-R/thanas-os ，核查 Dock.tsx，尺寸依赖视口、指针邻域放大。现有Dock已具弹簧和几何测量，不引入第二套。
- satyajiit/SatyajitOS-macOS-Portfolio（GitHub许可证识别NOASSERTION，仅研究）：https://github.com/satyajiit/SatyajitOS-macOS-Portfolio ，核查 materials.css、WindowTitlebar.vue；材质令牌、公共窗口外壳。未复制源码、素材、商标图形、Apple字体或壁纸。
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/designing-for-macos 、https://developer.apple.com/design/human-interface-guidelines/the-menu-bar 、https://developer.apple.com/design/human-interface-guidelines/toolbars
## 实施原则
以 Monterey/Ventura 桌面构图为基础，吸收 Tahoe 的分层玻璃语言，不强制追随尚未确定的系统版本。保留原有系统字体、图标动作、持久化、窗口引擎、经典模式；使用原创CSS应用图标材质。菜单栏、Dock、窗口和桌面壁纸应有不同透明度及阴影，避免全局统一重玻璃。固定 Finder 系统入口不写入用户收藏，Dock 空时仍有 Finder；不自动填充用户清空的应用收藏。保留ICP备案，视觉弱化。下一步使用真实截图检查深浅、密度、全局窗口及窄屏，继续逐个应用精修。

## 第一轮视觉结果
- 系统菜单栏30px、桌面专属材质；Finder常驻系统入口，不修改用户固定应用。
- 空白桌面默认从右上角按列排列，已有位置保持；桌面标签不再常驻深色背景。
- Dock底座、交通灯、窗口标题、侧栏、工作区、小组件及主要应用图标统一重构。
- 实际截图保留于 /Volumes/data/AI-Development/logs/inftab-macos-visual-20261126（浅色桌面、Finder、深色桌面及390px窄屏），不提交图片。截图使用隔离测试数据，不修改用户浏览器数据。
- 剩余差距：应用图标仍主要为原创材质+Lucide，尚非完整图标插画体系；固定Finder与用户Dock图标的动画尚未归一；真实macOS的菜单应用上下文和窗口工具栏一体化、复杂应用内容、不同系统版本材质以及桌面布局预设还需深化。

## 经典 Spotlight 方向（2026-11-26）
用户明确希望整体设计参考老款 macOS Spotlight。本轮选择 Yosemite / El Capitan 时代的单条搜索入口与展开后的双栏预览，而不是新一代重玻璃或 AI 搜索。历史参考：Apple 2014 MacBook Air Quick Start Guide https://cdsassets.apple.com/live/6GJYWVAV/start/ma1670_mb_air-11-inch-early2014_qs.pdf （搜索结果显示经典左结果、右预览结构；未复制素材）。统一桌面顶部放大镜、Ctrl/Command+K、可被浏览器接收的Ctrl/Command+Space，保留Ctrl/Command+Shift+P。Ctrl/Command+F和查找快捷入口命令仍保留独立快捷入口筛选；现有网页搜索设置及经典模式保留。空查询只显示搜索框，可用方向键或展开按钮显示最近操作及建议；明确查询后才展示本地记录，笔记正文仅在选中预览内以纯文本显示，最长1800字符，不上传。宽屏单击预览、双击/回车打开；窄屏单列单击打开。实际截图存于外置日志目录 classic-spotlight-compact.png / classic-spotlight-results.png。整体桌面、内置应用尚未全部按经典年代视觉重构。

## Liquid Glass 全局材质方向（2026-11-26）
- 用户要求保留经典 Spotlight 交互，视觉参考 Apple 最新 Liquid Glass。核对 Apple HIG Materials（https://developer.apple.com/design/human-interface-guidelines/materials）、Adopting Liquid Glass（https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass）、WWDC26 Platforms State of the Union（https://developer.apple.com/videos/play/wwdc2026/102/）。原则：玻璃优先用于导航和浮动操作层，正文层用标准材质；采用层级、边缘光泽、透光度、圆角与内容可读性，不对每个按钮叠加模糊。
- tokens.css 是桌面及传送Dock菜单的材质所有权：mac-glass-filter/sheen/edge/shadow/focus-shadow/widget/control/control-shadow；浅深独立。Dock较清透、菜单和Spotlight较浓、桌面小组件更厚；窗口正文保持不透明。支持 backdrop-filter 或 -webkit-backdrop-filter 时启用；否则默认实色。prefers-reduced-transparency 与 forced-colors 明确关闭滤镜和光泽，恢复实色及轮廓。没有GPU折射模拟、SVG位移、动态逐像素采样、第三方素材或新依赖，非Apple原生Liquid Glass渲染。
- Spotlight 仍用旧式紧凑条和左右结果/预览，空态28px/展开22px圆角，窗口18px；菜单13px、弹层18px、Dock24px，窗口停靠按钮和工作区/搜索采用胶囊轮廓。改动仅作用桌面模式，经典模式数据与布局不变。控制中心、内置应用逐页面设计以及真实折射/自适应色彩仍未完整实施。

## Liquid Glass 材质精修与控制中心（2026-11-26）
- 在已有材质令牌上增加方向性径向高光与分边内阴影；仍是静态CSS光学近似，无真实场景折射或逐帧像素处理。应用图标的6处重复材质归并到唯一app-material/app-ink定义；保留色彩语义。Spotlight结果淡入、圆角连续过渡，减少动效模式关闭新增动画。
- 复用DesktopMenus作为独立的右侧控制中心实例，具有外观三选一、网页搜索栏/时钟/Dock放大/图标名称开关和系统设置入口，直接绑定真实preferences，不增加另一套设置存储。ARIA menuitemradio/menuitemcheckbox与现有菜单键盘导航共用，窗口叠层开启时关闭菜单。保留原左侧菜单及经典模式。390px窄屏已测试，320px及真实触屏尚未验证。
- Spotlight命令检索补齐NFKC规范化，与本地记录检索一致；未扩展网络索引、OS系统状态或真实硬件控制。控制中心截图保留于外置日志目录 liquid-glass-control-center.png。

## 开源源码移植基线（2026-11-26）
用户明确反馈之前逐步叠加的视觉设计不满足要求，转为直接复刻成熟开源实现。筛选：
- a2d2-dev/macos27-claude（MIT，主参考），https://github.com/a2d2-dev/macos27-claude/tree/e3a4e72b8d46b55828796a362799be1d7f511ef4 ，演示 https://macos27-claude.vercel.app/ 。核查src/styles/glass.css、src/components/ControlCenter.tsx、Spotlight.tsx、Dock.tsx、Window.tsx；实际移植glass.css的glass/popover/menu bar滤镜与阴影令牌，并将ControlCenter的ToggleTile结构转换到Vue；保留原MIT版权及许可于docs/licenses/macos27-claude-MIT.txt。
- Thanas-R/Thanas-OS（MIT），https://github.com/Thanas-R/Thanas-OS/tree/5a430db1abf4c4545c88c717b9eaebb1d789a0ae ，演示 https://thanasos.thanas.dev/ 。核查Spotlight.tsx，快速入口/结果结构与真实记录索引的思路；不复制当前不符合用户经典双栏Spotlight要求的单列结果布局。
- StarKnightt/macos-web（MIT），https://github.com/StarKnightt/macos-web ，演示 https://starknightt.github.io/macos-web/ 。核对仓库说明/许可证元数据，尚未逐模块移植。
- 主参考与本项目框架不同，选择直接移植CSS令牌及组件模板和交互语义，不引入React/Tailwind/Framer Motion。现有菜单栏和小控件保留更高遮盖度以适配用户任意壁纸，保留opaque正文和减少透明度降级；参考Dock的26px轮廓与底部留白，复用现有可靠拖动与动画引擎。控制中心改为324px宽双列60px模块、32px圆形状态图标、18px圆角及真实开关状态，窄屏钳位；不伪造Wi-Fi/蓝牙/剪贴板等。Finder统一胶囊工具组、搜索及右键材质。本轮是第一批真实移植，不是整站1:1复刻；后续以单一参考源码布局为主，优先逐个迁移窗口外壳、Finder、内置应用以及完整Dock视觉，避免继续混合多套风格。截图存外置日志upstream-port。

## ThanasOS 单一复刻基准（2026-11-26）
用户指定 https://github.com/Thanas-R/Thanas-OS 为后续唯一视觉与交互主参考，锁定已检查提交5a430db1abf4c4545c88c717b9eaebb1d789a0ae，MIT许可证完整保留于docs/licenses/Thanas-OS-MIT.txt。GitHub连接器核对package.json：React18.3.1、Vite5.4.19、TS5.8.3、Tailwind3.4.17、Framer Motion12.38.0、Radix/shadcn。现有inftab为Vue3.5.43、Vite8.3.4、TS5.9.3、Interact.js1.10.29、Swiper14.4.0、Lucide Vue；不擅自迁移框架。首批直接转换ControlCenter.tsx的360px外壳、左侧连接状态栈、右侧突出模块及外观区布局；绑定真实网页搜索/时钟/Dock放大/名称显示与外观设置，不复制模拟硬件。保留经典双栏Spotlight、用户数据、原MIT通知和既有材质，浅深适配及窄屏单列。后续以ThanasOS实际源码为基准逐模块替换旧视觉，而非继续拼接其他项目。当前仍非整站复刻。
