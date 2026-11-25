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
