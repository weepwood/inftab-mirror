# macOS 桌面视觉专项

本轮以正式 V2.0.0 为基础，优先完善桌面模式的可见体验，独立于 #37 数据迁移。目标是贴近 macOS 桌面的信息密度、材质、布局、字体与状态反馈，而不是仿造操作系统权限或宣称系统级等效。

## 参考与取舍（2026-11-25）

- Apple HIG: [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos)、[Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[Windows](https://developer.apple.com/design/human-interface-guidelines/windows)、[The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar)。
- Apple 用户指南：[Desktop, menu bar, and Dock](https://support.apple.com/guide/mac-help/desktop-menu-bar-and-dock-mchlws12345m2/mac)。参考系统结构，不复制 Apple 私有系统资源；沿用已许可的 Lucide、现有窗口/拖动引擎及用户图标，不分发 SF Pro 或苹方字体文件。
- 默认系统字体栈，macOS 使用本机系统字体，Windows/Linux 自然回退；中文采用系统可用字体。实际字形由 OS/浏览器决定。

## 第一批实现
- 桌面专属 --mac-* 令牌：中性浅/深色窗口、层级侧栏、蓝色选择、菜单和 Dock 磨砂、主动与非主动窗口阴影。仅桌面模式调整默认语义令牌，自定义应用内容色保留。
- 顶部菜单栏材质、按钮密度、字体；Finder 与工具窗壳的交通灯（非活动灰、悬停颜色及符号）、标题权重、边界与阴影。
- Finder 中性侧栏、工具栏、列表交替色和高对比蓝色选中；桌面文件名、上下文菜单、Dock 与 Spotlight 命令面板材质；窗口概览表面。
- 保持已有布局坐标、窗口行为、经典 Swiper 模式和备份格式。未更改用户图标、壁纸、字体文件、数据后端或默认启动模式。

## 集中后续验收与开发
1. 实际截图对照：Mac 本机浅/深、1280×900、1440×900、1920×1080、窄屏/短屏、不同壁纸。确认顶部菜单、窗口几何、字体、对比度、Dock、所有真实控件。
2. 原生菜单栏深化：真正的菜单项与快捷键、焦点及窄屏收纳，真实可用的状态栏（不伪造系统电量/Wi-Fi）。
3. Finder：标题栏/导航、图标与列表密度、选中与预览，完善真实文件夹图标/资产许可。
4. Dock：放大、运行与最小化、分隔区、提示浮层及可中断动效；保留用户设置。
5. Spotlight、Mission Control、设置与小组件：完整独立视觉层级，键盘操作、双主题、reduced-motion、forced-colors、窗口焦点。
6. 复用成熟组件而非重写窗口引擎；在视觉差异和实际浏览器交互均通过后，合并并核验 Pages，独立于 #37 后续迁移。当前首批代码尚未完成新 CI/截图核验，不宣称 1:1。

