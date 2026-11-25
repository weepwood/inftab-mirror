# 桌面交互与布局稳定性专项

基线：正式 Pages 提交 f3a3d03（#38）。本专项独立于 #37 存储迁移，不改变数据结构或已发布版本。

## 桌面操作契约

| 操作 | 行为 |
| --- | --- |
| 左键单击 / 触屏轻点 / Enter | 打开应用、快捷网址或 Finder 文件夹 |
| 左键按住移动 | 不移动图标；超过 5px 不触发误打开 |
| 右键短按（或按住不移动再松开） | 显示操作菜单 |
| 右键按住至少 180ms 后拖动至少 5px | 预览移动，松开后提交；放入文件夹沿用原归属事务 |
| Ctrl/⌘ 或 Shift 点击、Space | 选择/取消选中；空白区域左键框选 |
| 右键长按拖动选中图标 | 整组移动，保留相对位置 |
| Alt + 方向键 | 键盘移动；方向键导航；Shift+F10 打开菜单 |
| Escape、失焦、指针取消、尺寸变化、切换工作区或打开模态 | 取消活动拖动，恢复原位置，不保存 |

180ms/5px 是本次为避免误操作选定的初始阈值，并非系统 macOS 默认行为。触屏支持轻点及滚动，不增加触屏长按拖动。Finder 内的文件选择/双击打开和 Dock 重排保留原行为，避免改动其独立交互契约。

## 组件隔离

- 桌面图标改为显式 Pointer Events 生命周期，使用原坐标吸附/碰撞/组移动引擎；InteractJS 仍用于窗口拖动与调整大小。指针捕获、取消和释放明确区分；不依赖全局超时抑制下一次点击。
- 右键菜单独占焦点，使用共享 navigateMenu，Escape 恢复触发按钮焦点，外部点击关闭，菜单位置限制在视口内。打开本地搜索或模态时取消活动手势，点击桌面空白或打开图标退出临时搜索。
- 拖动仅在松开时写入。移动坐标前将所有当前可见图标的位置物化为基线，避免其他默认图标自动补位；保留隐藏项已有坐标。整个移动仍单次持久化，不新增数据库或格式。归属变化、显式整理、屏幕尺寸变化的正常重排不等同于临时浮层位移。
- 桌面搜索脱离普通文档流：常驻搜索保留固定空间，临时搜索覆盖在桌面上而不移动图标。经典模式居中自适应规则不再作用于桌面。搜索中的文件夹打开 Finder 而非文件夹编辑器。选中标签使用固定内边距，避免图标内部高度变化。

## 实际验收（2026-11-25）

Mac Edge 生产构建和类型检查通过。首次最终宽范围 66/67，唯一失败为新增组移动测试假定工作区仅有三项，但默认内置图标也被物化；改为检查目标坐标和所有未移动图标的实际变换矩阵，随后四个核心专项 4/4 通过。之前 URL 测试修正规范化末尾斜线。没有取消业务断言。50/200/1000 图标拖动 P95 16.8/16.8/16.7ms，拖动期间零写入、松开一次写入。首屏 59.5/60.5 KiB，非 Swiper 198.0/200，Swiper 26.4/30，CSS 32.1/64；PWA 额外 JS 10757/16384 B，站点 1721083/4194304 B。新远程 CI 尚待核验，不宣称跨浏览器或上线已经完成。

## 自主 HCI 审查与修复（第二批，2026-11-25）

依据 [Apple HIG Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles/)、[Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection/)、[Menus](https://developer.apple.com/design/human-interface-guidelines/menus)、[W3C APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) 和 [Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)，核查操作一致性、焦点、浮层、可达性和反馈（本轮查阅日期 2026-11-25）。

- P0 搜索可见不等于可点击：home-content 的层叠上下文使临时搜索低于已有窗口。移除桌面内容层的独立 stacking context，常驻搜索仍低于窗口，临时搜索在窗口上方，模态背景及原生 dialog 保持优先；不改变画布空间。点击搜索外部关闭，顶部窗口菜单打开前关闭搜索。实际 elementFromPoint 及点击测试验证命中，而非仅检查 visible。首次实验性 Teleport 在模式切换时复现 Vue insertBefore/null 挂载失败，已完全撤销，最终采用原挂载位置和 CSS 层级。
- P0 模态后台交互：桌面模式打开模态时标题栏、主内容、非模态窗口、Dock 与跳转入口 inert，Dock 取消活动手势并关闭菜单；设置关闭后 nextTick 恢复原焦点，防止焦点请求发生在解除 inert 前。WindowFrame 不在 inert 祖先下抢焦点。经典模式行为维持。
- P1 菜单：鼠标打开也将焦点移入菜单；上下方向键、Home/End、左右菜单切换、Escape 与触发器焦点恢复，复用 navigateMenu；窗口概览支持外部点击、Escape、再次按窗口入口关闭，打开应用/切换空间/模态/搜索时关闭。仍为非模态区域，不将其伪装成完整系统 Mission Control。
- P1 一致的打开行为：Dock 文件夹走同一 Finder 路由，跨工作区文件夹根据所有者打开；回到首页进入默认工作区而非空操作，不关闭其他窗口。保留真实事件参数和原网页打开规则。Finder 键盘操作尊重 IME 与已消费事件。
- P2 视觉与输入方式：工作区弹层使用桌面中性色、蓝色选择、统一圆角/聚焦描边；粗指针下交通灯与停靠按钮扩大，鼠标下保留紧凑视觉。原生选择器仍沿用现有渐进增强，未新建自定义 select 或引入依赖，完整触屏拖动仍待独立设计。

上一提交 fedbfe0 verify/UI/Firefox-WebKit 三项远程 CI 全部通过。最终第二批 Mac Edge 生产浏览器 74/74 通过（desktop-alpha、alpha2、storage、production-chunks、productivity、accessibility、workspace-switcher），check 和 build:web 成功。真实组合用例包含鼠标/键盘菜单导航、Dock 文件夹、设置 Tab 焦点隔离与恢复、搜索跨窗口命中和概览开关。构建首屏59.7/60.5、非Swiper198.6/200、Swiper26.4/30、CSS32.3/64 KiB；PWA额外10755/16384 B、站点1725298/4194304 B。未扩大预算。最终代码尚待新远程CI；本轮不能宣称完整 WCAG 合规、真实触屏设备覆盖或已经上线。
