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
