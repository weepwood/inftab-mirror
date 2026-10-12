# 内置面板与首页小组件开发

当前插件注册表用于组织仓库内受信任的功能模块，不会加载远程 JavaScript。新增模块时保持按需加载，并让数据校验、备份和交互测试跟上功能实现。

面板 adapter 的最小状态/操作上下文、属性和事件参数类型集中在 `src/plugins/registry.ts` 的 `PanelContextById`、`PanelPropsById`、`PanelEventsById`；首页小组件对应定义在 `src/plugins/widgetRegistry.ts` 的 `HomeWidgetContextById`、`HomeWidgetPropsById`。注册适配器时，TypeScript 会按 ID 限制其可访问的上下文并检查返回值。为新模块只暴露它实际需要的状态和操作。若更改组件契约，同步更新这些类型和 `src/plugins/registry.test.ts` 中的键名断言，并为实际组件交互保留端到端回归。`npm run check` 会执行插件测试的静态类型检查。

## 新增工具面板

1. 在 `src/plugins/ids.ts` 的 `availablePanelIds` 中加入稳定、唯一的 ID。
2. 在 `src/plugins/registry.ts` 的 `panelPlugins` 中新增同 ID 的定义，提供标题、说明、异步组件、属性适配器和事件适配器。通过文件内的 `lazyPanel(() => import('…'))` 注册面板；它调用 `src/plugins/asyncComponent.ts` 的 `lazyPluginComponent`，统一提供加载状态、失败提示和重试。不要把面板组件静态引入首页，也不要绕过该包装器。
3. 如果面板由内置快捷入口打开，在 `src/data/defaults.ts` 为入口设置 `action`，并在 `launcherPanelRoutes` 加入路由。路由只能指向已登记的面板。
4. 只通过 `PanelPluginContext` 暴露面板需要的操作；避免让页面组件直接依赖 `App.vue` 内部状态。
5. 在 `src/plugins/registry.test.ts` 覆盖 ID、路由、元数据和事件适配器，并为模块自身的数据处理和完整用户流程添加测试。

## 新增首页小组件

1. 在 `src/plugins/ids.ts` 的 `availableHomeWidgetIds` 中加入稳定、唯一的 ID。
2. 在 `src/plugins/widgetRegistry.ts` 用同 ID 注册标题、说明、可选的关联面板、异步组件和上下文属性适配器。通过文件内的 `lazyWidget(() => import('…'))` 注册组件；该包装器同样使用 `lazyPluginComponent`，为组件保留一致的加载和重试反馈。
3. 在 `src/components/` 新建小组件。若需要详情视图，在注册信息中填写关联面板，标题会打开它；独立小组件省略 `panel`，标题显示为非操作文本。首页排序和移除由组件架统一处理。
4. 调整 `src/data/sanitize.ts` 与 `src/data/backup.ts` 的兼容逻辑（若 ID 由清单自动接受则仍需验证备份行为），确认旧备份缺少此项时仍能正常导入。
5. 为小组件显示、打开面板、排序、移除、窄视口布局和备份往返添加覆盖。
6. 新增 ID 会自动获得标准宽度默认值；若要为组件指定其他默认宽度或新增宽度变体，需同步更新 `Preferences.homeWidgetSizes`、清理逻辑和测试，并覆盖桌面网格行数及移动端横向滚动布局。
7. 对随日期变化的组件，在标签页重新获得焦点、恢复可见或跨过本地午夜时刷新内容，并在卸载时清理计时器和事件监听器。

## 状态与质量要求

- 可持久化数据应由 `useLocalWorkspace` 管理，并在 sanitizer 中限制类型、数量和字段大小。
- 若面板与首页小组件共享状态，将状态放在 `useLocalWorkspace`，通过各自注册表的属性和事件适配器传入；为时间敏感或跨标签页状态选定正确的同步策略，并一并覆盖备份往返。
- 导入数据要验证引用关系；新增数据项要检查替换、合并、删除和跨标签页同步行为。
- 同一存储键发生并发编辑时，不同对象字段、不同 ID 记录和列表成员会尝试合并；同一字段、同 ID 新增/删除冲突以收到的外部值为准，同时发生排序调整时以外部顺序为准。像专注计时器这类状态应按语义选择是否启用合并。
- 浏览器权限按功能首次使用时申请；无需权限的网页版本应继续可用。
- 只读的可选浏览器数据小组件可使用 `useOptionalBrowserResource` 统一权限检查、变化订阅、防竞态刷新、撤权清理和卸载清理；小组件本身不应自动弹出权限请求。
- 先运行 `npm test`、`npm run check` 和 `npm run build`；涉及网站端完整交互、存储或权限的改动还要运行 `npm run test:e2e`，涉及扩展清单、可选权限或新标签页入口的改动还要运行 `npm run test:e2e:extension`。
- 保持首屏性能预算和异步分包检查通过。完成一个可独立审查的变更后再提交 Git，方便回退。
