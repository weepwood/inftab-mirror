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


## 第二批：实际桌面构图和截图验收

- 将用户已启用的时钟移入顶部菜单栏，保留日期、时间及原显示偏好；窄屏隐藏日期，极窄屏隐藏时钟以避免挤压操作。经典模式保持原布局。
- 桌面搜索（用户已启用时）缩为 420×40px 的紧凑表面；桌面操作条缩至右侧，不再横跨整个桌面，增加可用画布空间；不改变存储坐标、网格算法或默认启动模式。
- Finder 与桌面共用原创 CSS 文件夹字形，避免 Apple 私有资源；列表图标 24px、紧凑行高。窗口概览移到顶部中央，空间预览采用三列结构（非实时缩略图）。Spotlight 上移至常用搜索位置；不改变键盘交互。
- 实际 1440×900 Mac Edge 截图发现 Dock 底座与图标错位（原 CSS inset 与固定 height 冲突）；改为底部锚定，新增底座包围图标几何断言。截图复核确认底座已正确包围图标。
- 本机生产 Edge 宽范围 50/50，修复 Dock 后针对 Finder 双主题、运行状态与新视觉契约 4/4；构建门禁不变。Linux 新提交 CI 尚未验收；截图是当前实现证据，并非与 Apple 系统逐像素对照。

### 实际截图（Mac Edge，压缩 JPG，仅文档，不进入发布包）

- [桌面（1440×900）](screenshots/macos-desktop/desktop.jpg)
- [Finder 列表](screenshots/macos-desktop/finder.jpg)
- [Finder 深色（1280×900）](screenshots/macos-desktop/finder-dark.jpg)
- [Spotlight](screenshots/macos-desktop/spotlight.jpg)
- [窗口概览](screenshots/macos-desktop/overview.jpg)

下一批优先补齐真正的应用菜单、图标默认排列可选策略、Dock/窗口交互与 Spotlight 分类层级；不改变用户已保存位置。系统设置窗口及完整多分辨率/同环境视觉对照仍待完成。
