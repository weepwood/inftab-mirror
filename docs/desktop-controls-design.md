# 桌面公共控件与窗口交互专项

基于生产 main 9609e14。优先复用项目现有原生 SelectField、Lucide、原生表单及 InteractJS，不引入大型组件库。经典模式、已发布标签、用户数据和存储格式保持不变。

## 实施内容
- Finder 排序及归属操作、Mission Control 移动窗口、主题预设和快捷入口批量管理复用 SelectField；动作选择器保持原生 change/reset，不改变业务语义。桌面外壳统一中性边框、圆角、文字及焦点；用户自定义配色仍可用于其他内容，但桌面控件采用统一桌面色板。
- 设置滑块保留原生 range，加入稳定 aria-label 和背景暗度百分比，数值采用等宽数字和固定最小宽度；统一设置、布局及主题编辑器滑块的中性轨道、蓝色滑块、禁用和聚焦样式。浅深主题分别适配；粗指针扩大滑块及控件；forced-colors 回退系统原生外观。不新增独立数值输入组件，滑块仍保留键盘微调能力。
- WindowFrame 标题栏双击最大化/还原（按钮除外）；限制左键移动与调整大小，失去活动状态、隐藏或最小化时取消进行中的几何手势；停靠/最大化先结束未提交手势。活动/非活动标题色及长标题省略统一。不改窗口引擎与持久化几何格式。
- 设置面板与原按需管理工具归并 settings-tools chunk，减少重复压缩开销；首次进入设置会同时加载该组模块，首页启动仍保持独立按需加载。没有提高预算。

## 实际证据
- [Finder 控件浅色](screenshots/macos-desktop/controls/finder-controls.jpg)、[设置控件深色](screenshots/macos-desktop/controls/settings-controls.jpg)，Mac Edge 实际生产运行截图。深色原生滑块亮白轨道经截图检查后改为中性轨道；保留原生语义而非自绘交互。
- 本机 check、build:web 通过；最终 App/SettingsPanel/SelectField 96/96 单测、生产 Edge 64/64（desktop-alpha2、custom-theme、production-chunks、layout-editor、productivity、accessibility）。新用例验证排序、双击最大化及恢复、右键不移动、数值标签稳定、禁用状态、设置值持久化。
- 额外 ui-refinements 宽范围执行73通过、2失败、21未运行，失败为原生下拉键盘回退及强制高对比度用例在Mac Edge中 ArrowDown 未改变值；旧工作树4c507dc同样复现2/2失败，因此不拦截原生按键或放宽测试。未宣称完整浏览器/无障碍验收，新远程CI仍待验证。
- 最终本机首屏59.8/60.5、非Swiper197.9/200、Swiper26.4/30、CSS32.8/64 KiB；PWA额外10702/16384 B、全站1730103/4194304 B。Linux最终预算以新CI为准。后续优先验证实际失败、原生选择器跨平台交互与窗口边缘调整，不扩大数据迁移范围。

## 精确输入与窗口边缘交互（2026-11-25）

- RangeField 统一 14 项设置的原生 range 与 number。数值单位与模型值分离，提交时限制范围并对齐步长，未改动的已有值保持原值；空值恢复，Enter 提交，Escape 恢复，禁用状态同步。两者拥有独立可访问名称。继续使用原生步进，不自制按钮。
- WindowFrame 沿用 InteractJS，支持八方向缩放；调整左侧或顶部时对边固定，最小尺寸与视口限制统一由 windowGeometry 计算。宽度至少 600px 时，拖动进入左右 20px 边缘显示停靠预览；预览在活动窗口背后，不遮挡窗口内容。松开停靠，取消或解除停靠恢复原自由窗口位置和尺寸；不新增存储格式。暂不实现顶部停靠、停靠窗口直接拖出或触屏专项手势。
- 文件夹表单名称错误补充 aria-invalid、aria-describedby 和错误焦点样式。

真实 Mac Edge 生产截图：[精确控件](screenshots/macos-desktop/precision/precise-controls.jpg)、[窗口停靠预览](screenshots/macos-desktop/precision/snap-preview.jpg)。
本机类型检查、生产构建与相关单测 98/98 通过。宽范围生产浏览器首次 69/70，新增八方向测试累计向上扩大后到达安全边界，修正为有足够空间的起始位置并保留精确几何断言，最终两项专项 2/2。未重复全量浏览器回归。跨浏览器远程 CI 待验收。

## 窗口停靠恢复与轻量动效（2026-11-25）

基线 main c3cb6ae。左右停靠窗口拖动标题栏时恢复自由尺寸，按水平指针比例定位，Escape、取消、失焦恢复原自由几何与停靠状态。宽度至少600px时拖入顶部44px区域显示最大化预览，松开最大化，按钮或标题双击还原原自由几何。保留左右边缘20px触发与八方向缩放，未实现从最大化状态直接拖出，也不改变持久化格式。

最小化/恢复采用140ms透明度及轻微亮度过渡，停靠预览淡入120ms，减少动效沿用全局0.01ms规则。动画不插值窗口实际位置和大小。首次实验的clip-path入场可能遮住右下角缩放手柄，已完全撤销，改用不改变命中区域的亮度过渡。初次宽范围浏览器49通过/2失败/1中断/20未运行：缩放命中、停靠几何读取时序。修正后停靠与缩放6/6通过，新增减少动效断言曾误要求严格0s；按既有0.01ms规则核验，最终三项两并发重复三轮9/9通过（缩放、停靠取消及顶部最大化、快速最小化恢复与焦点），check/build:web通过。未重跑完整回归，最终远程CI待验收。Mac首屏59.8/60.5、非Swiper198.8/200、Swiper26.4/30、CSS33.3/64 KiB；PWA额外10701/16384 B、全站1734486/4194304 B。未提高预算、未新增依赖。

## 桌面视觉令牌与样式职责治理（2026-11-25）

基线 main c9361cb。将原 main.css 末尾的桌面专项样式抽离至 desktop.css，由 main.ts 在共享样式之后加载，保留原有级联优先级；共享 RangeField 样式留在 main.css，清除已废弃的 range-label strong 和重复的 command-option small 规则。tokens.css 统一桌面菜单、菜单项、窗口、浮层圆角、菜单内边距、选择前景色、滑块及开关轨道；局部布局仍由 Vue 组件负责。Dock 菜单 Teleport 到 body，不能从 home 继承变量，故 mac-dock-context 显式复用同一套浅深主题令牌，不重复硬编码颜色、边框、阴影；强制颜色模式采用系统色。保留经典模式及自定义主题作用域，不改变存储或行为。

真实 Mac Edge 截图：[浅色](screenshots/macos-desktop/visual-system/dock-menu-light.jpg)、[深色](screenshots/macos-desktop/visual-system/dock-menu-dark.jpg)。测试在 indigo 配色下比较顶部菜单、桌面右键菜单、独立 Dock 菜单的计算背景、文字色、边框、圆角、阴影，双主题一致。check/build:web 通过；7/7 定向视觉验收；最终生产浏览器宽范围 58/58（desktop-alpha2、visual-system、custom-theme、accessibility、productivity）。Mac 首屏59.8/60.5、非Swiper198.7/200、Swiper26.4/30、CSS33.3/64 KiB；PWA额外10707/16384 B、全站1735077/4194304 B。未增依赖或放宽预算。尚未专项模拟 forced-colors Dock、全面清理经典 CSS 或完成移动真机验收；远程CI待核验。
