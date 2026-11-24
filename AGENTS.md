# Inftab AI 开发指南（AGENTS.md）

> 面向接手本项目的 AI 编程助手与维护者。先读本文件，再核对实际分支、源码、PR 和 CI。本文不是实时状态服务；下方交接快照记录于 2026-11-24，后续应更新而不是盲目继承结论。

## 1. 项目定位与技术边界

- 仓库：[weepwood/inftab-mirror](https://github.com/weepwood/inftab-mirror)；线上：[GitHub Pages](https://weepwood.github.io/inftab-mirror/)。
- Infinity New Tab 的可维护本地优先前端重建，保留「雾林 · 轻透」视觉。原静态镜像位于 `reference/legacy-mirror/`，仅用于行为、资源和视觉对照，不是生产代码入口。
- Vue 3、TypeScript、Vite 8、Vitest、Playwright、@lucide/vue；使用 npm 及 package-lock.json，推荐 Node.js 24 LTS（满足 package.json engines：22.22.2+ / 24.15.0+ / 26+）。
- 同一生产 dist 支持 GitHub Pages 子路径和 Chrome Manifest V3 新标签页扩展；Vite base 为 './'。网页和扩展分别持有本地数据，不能假定共享存储。
- 无必须运行的后端、账号、云同步或远程插件运行时。现有内置插件注册表不等于开放 SDK。PWA、WebDAV 和第三方插件能力必须以对应版本实际实现及验证为准。

## 2. 接手顺序与当前交接快照

每轮先执行或通过 GitHub API 获取等价信息：

```sh
git status --short
git fetch origin
git log -1 --oneline origin/main
gh pr list --state open
gh pr view <PR编号>
gh pr checks <PR编号>
gh run list --limit 10
```

以实际 head SHA、base SHA、mergeable、各检查 conclusion 为准，不能将旧提交的成功结果当作新提交的验收。没有本地网络、权限或可用 Node 版本时，明确限制，使用已授权的 GitHub 工具和 Actions 日志；不要编造本地测试结果。

### 2026-11-24 快照

| 版本/PR | 状态与证据 |
| --- | --- |
| V1.1 架构治理 | 完整验收通过：[45368874183](https://github.com/weepwood/inftab-mirror/actions/runs/45368874183) |
| V1.2 视觉系统 | 修复焦点顺序回归后完整验收通过：[45376496953](https://github.com/weepwood/inftab-mirror/actions/runs/45376496953) |
| V1.3 个人工作台 | 小视口修复 #16 后完整验收通过：[45379979286](https://github.com/weepwood/inftab-mirror/actions/runs/45379979286) |
| V1.4.0 性能专项 | 已合并 #15；main 快照 `ae60eba2b022bb2e3c1c45276781f616b9353d33`；[正式验收 45382168902](https://github.com/weepwood/inftab-mirror/actions/runs/45382168902) 与 [Pages 45382169145](https://github.com/weepwood/inftab-mirror/actions/runs/45382169145) 成功 |
| [#17 V1.5.0](https://github.com/weepwood/inftab-mirror/pull/17) | 正式待审查，分支 `feat/v1.5-theme-editor`，head `b15d9857a6f8a947f973e1b4db19d6e4eb7e636e`；尚未合并 |
| [#18 V1.6 PWA](https://github.com/weepwood/inftab-mirror/pull/18) | 草稿，分支 `feat/v1.6-pwa-offline`，head `09ab37ab68c6d370a4273dd08466e5191dd49621`，base 为 #17 当前候选提交；未执行正式 CI，不能当作 main 功能 |

**当前阻塞：** #17 最新 [CI 45386276941](https://github.com/weepwood/inftab-mirror/actions/runs/45386276941)：83 个测试文件、671 项测试通过；首屏 JS gzip 61,959 字节，预算 61,952 字节，超出 7 字节（均四舍五入显示 60.5 KiB）；全部 JS 154.9/156 KiB、CSS 21.5/64 KiB、产物 1387.6/4096 KiB 达标。[UI 45386276728](https://github.com/weepwood/inftab-mirror/actions/runs/45386276728) 与 [数据 45386276673](https://github.com/weepwood/inftab-mirror/actions/runs/45386276673) 成功。不能因仅超 7 字节就跳过门禁。优先寻找有意义的首屏精简并留出余量；不提高预算、不删功能或验证。

**下一步：** 修复 #17 包体问题 → 同步最新 main 并核实最新 CI/UI/数据检查全部成功 → 审查合并 → 等待 V1.5 对应 main 的 Release validation → 将 #18 同步并改为 main 目标、正式待审查 → 完成 PWA 专项及实际升级/故障/扩展兼容验证 → 版本收尾。不能将 #18 合进 #17。GitHub Pages 部署成功与正式验收通过均不等于已经创建 GitHub Release 或上架扩展商店。

### 本轮交接补充
- 文档 #19 已合并，main 为 `ba25de2be398ae9cc8c3b758209d92d4e1f3218a`（仅新增 AGENTS.md）；本候选同步该提交。
- #17 在 b15d985 后继续复用布尔/整数偏好读取与 RGB 解析，保留原校验和预算；准确的新 head 与 CI 以 GitHub 为准，尚未验证。

## 3. 代码导航与责任边界

| 路径 | 职责 |
| --- | --- |
| `src/main.ts`, `src/App.vue` | 启动、首页组合、导航、浮层及业务协调；不要重新堆积所有业务逻辑 |
| `src/composables/useLocalWorkspace.ts` | 持久化工作台状态与业务协调 |
| `src/composables/workspaceLauncher.ts`, `workspaceProductivity.ts`, `workspaceBackup.ts` | 入口/文件夹/工作区操作、生产力数据操作、快照与导入 |
| `src/composables/useStoredState.ts`, `concurrentState.ts` | 存储写入、跨标签事件和并发合并 |
| `src/data/storageAdapter.ts`, `sanitize.ts`, `backup.ts`、`src/types.ts` | 同步存储适配、输入/数据规范化、备份契约、领域类型 |
| `src/data/homeWorkspaces.ts`, `workspaceOwnership.ts`, `workspaceLayout.ts`, `layoutEditor.ts` | 工作区归属、布局及草稿 |
| `src/composables/useHomeLayout.ts`, `useHomeNavigation.ts`, `useShortcutDrag.ts`, `useShortcutParticles.ts` | 首页尺寸、导航、拖拽与粒子动效 |
| `src/components/ShortcutGrid.vue`, `HomeWorkspaceTabs.vue`, `HomeDock.vue` | 网格、工作区菜单、Dock |
| `src/data/launcherSearch.ts`, `src/components/LauncherSearchResults.vue` | 本地搜索索引与结果界面 |
| `src/components/HomeLayoutEditor.vue`, `ShortcutManager.vue`, `src/data/shortcutBatch.ts`, `shortcutTags.ts`, `bookmarkHtml.ts`, `backupHistory.ts` | 布局/组件中心、批量入口、标签、书签与恢复点 |
| `src/styles/tokens.css`, `main.css` | 语义设计令牌、基础界面与响应式样式 |
| `src/composables/overlayFocus.ts`, `src/components/SelectField.vue`, `CommandPalette.vue` | 浮层焦点、选择框回退、命令面板 |
| `src/plugins/ids.ts`, `registry.ts`, `widgetRegistry.ts`, `asyncComponent.ts` | 内置可信面板/小组件的 ID、类型化上下文、属性/事件、按需加载和重试 |
| `vite.config.ts`, `scripts/check-bundle-size.mjs`, `scripts/check-extension-build.mjs` | 分包策略、体积门禁、MV3 包结构和版本一致性 |

候选分支额外入口（main 尚无）：#17 的 `src/data/customTheme.ts`、`themeEditorData.ts`、`themeExchange.ts`、`configMigration.ts`、`src/components/CustomThemeEditor.vue`、`ConfigMigration.vue`；#18 的 `scripts/build-pwa.mjs`、`pwa-client.js`、`pwa-worker.js`、`pwa.css`、`e2e/pwa-offline.spec.ts`。

## 4. 不可破坏的行为与数据契约

- 保持 localStorage 原 `inftab.*.v1` 键（preferences、shortcuts、folders、launcher-order、home-workspaces、active-home-workspace、todos、notes 等）；备份保持 `format: inftab-workspace, version: 1`。新字段可选，明确区分缺省与显式清除。不要为版本号升级重置用户数据。
- 数据由 store 与 adapter 统一管理。写入有 180 ms 防抖，隐藏/离开/作用域销毁时尝试 flush；损坏的远端 JSON 不应覆盖有效本地编辑。普通字段/不同 ID 尝试合并，冲突由外部更新优先；工作区归属有专门合并规则，计时器不做通用字段合并。
- 快捷入口/文件夹/工作区 ID、归属、Dock、排序必须同步校验；跨工作区移动解除旧文件夹引用。普通快捷入口上限 500、工作区上限 20；具体字段上限以 sanitizer 为准。
- 备份与迁移先解析、校验、预览、确认；删除、批量移动及重要恢复操作保存恢复点并检查并发变化。IndexedDB 历史为本地 `inftab-backup-history`，每份最多 8 MiB、最多 7 条且总计 24 MiB；自动每日最多一次，按需生成快照。不等同云备份，浏览器清理站点数据可能丢失。
- Netscape HTML 书签导入仅允许安全 HTTP(S) URL、拒绝凭据、去重、容量保护；导入展平至当前工作区，导出按工作区/文件夹组织。不要执行导入 HTML 或动态脚本。
- 本地入口查找仅在本地数据中匹配，不自动转向网络搜索；隐藏入口不显示，跨工作区共享工具去重，保持原评分顺序、标签匹配、键盘和输入法语义。V1.4 索引仅在源数据变化时重建。
- 工作区独立布局部分覆盖全局设置，编辑草稿不得意外锁定继承字段。小组件配置目前全局共享；编辑预览不运行真实联网组件。
- 网站、搜索、书签、历史打开方式相互独立；保持 Ctrl/⌘/Shift/中键及文件夹打开全部的行为。
- UI 保持雾林轻透、四套内置配色、浅/深/系统独立模式；统一语义 token、Lucide 图标、焦点恢复、Esc 分层关闭、中文 IME、防止背景翻页、触控及 prefers-reduced-motion。注意 320×360 短视口必须能滚动操作工作区菜单。
- 扩展不得扩大必需权限。天气/资讯仅在启用后联网，扩展在明确操作时申请精确可选主机权限；书签、历史、当前标签页、常用网站按需申请可选权限。撤权后清除读取的数据。网页保留功能不可用说明。
- 插件新增遵循 registry 类型约束、最小上下文、lazyPluginComponent；新增可持久化字段同时检查 sanitizer、备份、合并及测试。禁止直接加载远程 JS、任意 CSS 或未经审查的插件代码。

## 5. 版本开发内容与后续路线

| 版本 | 范围 |
| --- | --- |
| V1.1 | 架构拆分、Storage Adapter、并发存储恢复、CI 构建复用 |
| V1.2 | 语义 Design Tokens、四配色、全局命令面板、共享浮层与无障碍交互 |
| V1.3 | 工作区独立布局、首页草稿编辑、小组件中心、批量入口/标签、HTML 书签、本地历史 |
| V1.4 | 搜索索引与评分桶、文件夹预览、Map/Set、响应式依赖隔离、自动备份、异步图标、稳定翻页 key、粒子 Canvas 最多 4 Mi 像素 |
| V1.5（#17） | 浅/深主题、受控 JSON 导入导出（16 KiB）、对比度检查、最多 20 主题预设、跨标签冲突保护、选择性配置迁移与恢复点、部分遗留样式令牌化 |
| V1.6（#18） | 网页端主动启用 PWA，构建时 SHA-256 资源清单、4 MiB 单版本预缓存、安装、缓存详情、更新等待、停用/清理与离线反馈 |
| V1.7（规划） | 内置插件 SDK 与扩展体系；先明确能力、类型、版本、隔离、权限和生命周期，不直接开放远程执行 |
| V1.8（规划） | 可选 WebDAV / 自托管同步，先设计认证、冲突、离线队列、恢复与安全模型 |
| V1.9（规划） | 平台整合、扩展独立发布、兼容性与稳定性 |
| V2.0（规划） | 完整平台里程碑，综合验收 |

#17 注意：主题格式 `inftab-theme` v1，只接受六位十六进制色与受限数值；基础纯色对比度不代表所有透明场景通过 WCAG。预设与应用主题独立。配置迁移四组（外观、全局布局、组件、入口与工作区/Dock），未选数据和生产力内容保留。旧备份可缺少新字段。

#18 注意：默认不自动启用；缓存仅同作用域已列举的静态资源（包含懒加载模块），不得缓存任意网络请求、个人数据或扩展清单。新版本完整校验后等待旧页面全部关闭，不强制 skipWaiting；失败保留旧版本。清理只针对当前应用缓存，不清除用户数据或其他应用缓存。HTTPS/localhost 网页可用，扩展协议不得注册。现有三项 PWA 生产回归尚待运行；需要真实双版本升级、损坏响应失败回滚、缓存停用竞争、Pages 子路径、Chrome/Edge 安装、MV3 隔离等验证。联网服务和外部网站不会因 PWA 而变成离线可用。

## 6. 开发验证、CI 与发布规范

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npm run verify
npm run benchmark:launcher
```

| 层级 | 执行范围 |
| --- | --- |
| L1 日常 PR | `npm run verify`：类型、单元/组件、资源、一次生产构建、包体与 MV3 结构校验；不重复安装浏览器跑全量 E2E |
| L2 高风险变更 | Focused UI validation / Focused data validation，依路径执行 Chromium 专项；PWA 专项仅在 #18 候选分支，待合并验证 |
| L3 正式里程碑 | Release validation：完整 dev E2E、稳定 Chrome/Edge、生产预览、实际 MV3；复用同一次 dist 构建 |

专项命令按当前分支工作流核对；main 当前可使用：

```sh
npx playwright install chromium
npm run test:e2e -- e2e/visual-system.spec.ts e2e/accessibility.spec.ts e2e/ui-refinements.spec.ts e2e/workspace-switcher.spec.ts
npm run test:e2e -- e2e/data-management.spec.ts e2e/layout-editor.spec.ts
npm run test:e2e
npm run test:e2e:stable:built
npm run test:e2e:production:built
npm run test:e2e:extension:built
```

带 :built 的命令需要已有对应生产构建；完整兼容测试需要安装 chromium、chrome、msedge。候选分支增加 `custom-theme.spec.ts`、`config-migration.spec.ts`、`pwa-offline.spec.ts`，按相关工作流实际执行。不要跳过失败测试或增大超时掩盖缺陷。

当前性能硬预算：首屏 JS gzip **60.5 KiB = 61,952 字节**，全部 JS gzip **156 KiB**，CSS gzip **64 KiB**，总产物 **4096 KiB**。全部 JS 包含按需模块及未来 PWA 脚本；不要排除新脚本来绕过预算。保持备份解析不进入首屏；尽量让重型管理工具懒加载。

V1.4 已测搜索基准（合成数据、GitHub Actions 45378690939，非实际首页载入）：500 个入口、20 工作区、20 文件夹、12 查询一批、40 次采样，P50 9.309→0.813 ms，P95 11.303→1.266 ms；单次建索引 P50 0.580 ms。结果等价检查必须保留，耗时不是硬门槛。V1.4 首屏仍约 59.8 KiB，全部 JS 150.3 KiB；不要宣称首屏速度有相同百分比改善。

发布时只更新 package.json、package-lock 根及 packages[""] 版本、public/manifest.json 与对应发布说明，不能全局替换依赖版本。main 的 Pages 自动部署不代表正式验收。里程碑 `docs/releases/vX.Y.0.md`、里程碑 tag 或手动运行触发 Release validation；以实际目标提交成功为准。

## 7. Git 工作方式与 AI 协作

- 这是个人项目，日常快速迭代。每轮对话先检查现有 PR，再实施一个明确阶段，中文提交标题；保持改动集中、可回退、独立 PR。未经要求不新增定时任务或后台自动复审。
- 用户允许审查并合并无问题的开发 PR。仅在当前 head 的必需/相关检查通过、diff 审查无阻塞、base 最新且无冲突时执行；有前置版本正式验收门禁则先满足它。优先 squash merge；不要强推或覆盖其他开发者变更。
- 合并 stacked PR 前确认实际 tree 一致或完整合并前置差异，不能仅改目标分支就假定触发 CI；如无新检查，提交必要真实修复触发 synchronize。禁止复用旧 head 检查结果。
- 不为小迭代机械运行全量 E2E，但数据、安全、权限、核心导航、离线升级等高风险必须专项验证。正式发布必须完整验收。
- 每轮报告实际改动、PR/commit、验证证据、失败原因、尚未完成的事项；区分“已提交”“已合并”“已部署”“已验收”。演示示意图不是实际截图，理论计算不是实测。
- 尽量保持既有视觉、功能、数据和安全边界，不无故引入依赖。先审查源码与证据，后做最小充分修改。
- 更新本文件的交接快照及相应路线/发布文档时，保留稳定规范，替换过时状态；避免把每次微小改动堆成流水账。

## 8. 继续阅读

- [README](README.md)：运行命令、产品介绍及发布策略。
- [架构演进路线](docs/architecture-roadmap.md)：各版本具体改动。
- [已实现功能](docs/implemented-features.md)：能力清单；若内容滞后，以源码与已验收提交为准。
- [内置插件开发](docs/plugin-development.md)：注册、类型契约、权限、组件与测试。
- [UI 设计规范](docs/ui-design.md)、[交互细节](docs/ui-skill-refinements.md)、[参考审计](docs/product-reference-audit.md)。
- [V1.4 发布说明](docs/releases/v1.4.0.md)，后续版本说明位于对应候选分支，合并后可在 main 查询。


## 首页交互专项候选（2026-11-24）
- 默认隐藏时钟与常驻搜索，保留已有用户显式偏好和按需搜索；默认使用滑动效果。
- 滚轮归一化、累计小增量、取消固定锁，滑动模式提供逐帧预览；保留短屏纵向滚动和浮层保护。
- Dock 增加自动隐藏偏好、鼠标拖动排序、失败图标回退与玻璃材质调整；触屏不自动隐藏。
- 风险：默认偏好变化、快速循环翻页与旧粒子动画、拖拽、窄屏及扩展备份兼容；须实际执行 CI 和浏览器专项验证。候选提交不代表验收通过。

- 首轮候选 #20（1c6bfda）常规 CI 发现 16 项失败，包含默认布局变化导致的旧测试前提失效及网格 DOM 预算回归；本次恢复相邻页挂载上限、明确旧偏好测试数据、补充新默认布局测试及自动隐藏备份校验。新提交仍须重新验收。

- 保留工作区切换器与 Dock 的非重叠布局边界（窄屏优先可操作性）；补充默认首页/滚轮环绕/按需搜索的 Chromium 验收，旧搜索与时钟测试显式使用旧偏好。

- #20 head a20a65d：[UI 专项 45394505966](https://github.com/weepwood/inftab-mirror/actions/runs/45394505966) 成功（包含 launcher benchmark）；[CI 45394505892](https://github.com/weepwood/inftab-mirror/actions/runs/45394505892) 83/83 文件、673/673 测试通过，首屏 JS gzip 62145/61952 B 超出 193 B。后续将默认关闭的时钟改为按需加载，保持预算不变，并补充生产 chunk 验证；新 head 需重新执行门禁。

- #20 head c2360b5：[CI 45394911323](https://github.com/weepwood/inftab-mirror/actions/runs/45394911323) 83/83 文件、673/673 测试通过；首屏 JS 60.4/60.5 KiB、全部 JS 155.8/156 KiB、CSS 21.9/64 KiB、产物 1390.8/4096 KiB 均达标；[UI 45394911521](https://github.com/weepwood/inftab-mirror/actions/runs/45394911521) 成功。正式发布的稳定浏览器、MV3、跨标签并发与旧 Dock 交互测试更新显式配置，保留原有行为断言及新增默认布局断言；当前新提交尚未验收，不将前序绿灯冒充新 head 结果。

## 连续滑动与 Dock 深度打磨候选（2026-11-24）
- #20 已合并到 f9abe11，CI 45395230139 与 UI 45395230086 成功，Pages 45395462136 成功。正式发布完整浏览器验收与真实设备触控板仍待验证。
- 新专项独立于 #18 PWA：滑动模式改用可见位置驱动的虚拟循环槽（最多四个），逐帧按经过时间吸附、反向操作从当前视觉位置开始；粒子/拖尾保持原路径。Dock 增加前后插入反馈与 Shift+方向键排序、拖动期间保持展开。未经真实设备测试，不声称实现完整触控板物理惯性或高刷新率验收。
- 首屏与全部 JS gzip 预算保持不变；此前余量很小，需 CI 实际验证。

- #21 首轮 UI 45395894380 成功、CI 45395894238 675/675 单测通过但全部 JS gzip 160074/159744 B（超 330 B）；#18 旧分支 45389399034 与 45389399104 均因包体积失败，PWA 独立处理，不降低预算。
- 本轮将 slide/trails 共用虚拟轨道、移除五循环重定位代码，按四舍五入后的可见槽更新列表，使用解析式临界阻尼吸附及速度估计；粒子模式继续独立渲染。Dock 放大考虑可用边界、增加 CSS 提示；管理器新增工作区筛选；短屏无搜索间距纳入布局预算。新的提交需重新验证，无真实设备帧率数据。

## 滑动输入与 Dock 合成层专项（2026-11-24）
- #21 d61d4cd 的常规 CI 45396670651、UI 45396670646、数据 45396670506 全部通过：675 单测、32 UI、4 数据浏览器场景；JS 60.4/60.5 与 155.9/156 KiB。已 squash 合并至 f39411c；Pages 45396942765 构建与部署成功。
- 新分支将逐帧小数位移写入 CSS 自定义属性，Vue 只更新可见槽中心；保留细粒度滚轮余量、短程速度投影与反转抵消；Dock 几何采样由逐图标读取改为首末两个固定槽，优化玻璃材质及唤醒曲线，避免原生与自定义提示重复。新增细粒度输入测试。预算不变，真实设备与完整发布验收仍未完成。
