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

- #22 0fd8dfd：UI 45397212813 33/33 通过，CI 45397212935 83/83 文件、676/676 测试通过；首屏 gzip 61958 B/61952 B，超 6 B，不能合并。此次复用分页逻辑、简化滚轮结算与 Dock 边界计算，不改预算；补充桌面居中布局、Dock 轻量弹性缓动与插入反馈，以及 Chromium 帧间隔/轨道覆盖诊断（帧率只记录不设机器相关阈值）。拖拽采用插入位移而非完整 FLIP，真实设备触控板与 120/144 Hz 仍待验收。

- #22 907daee：CI 45397594763 单测 677/677 通过、全部 JS gzip 159746/159744 B 超 2 B；UI 45397594826 35/35 通过。移除 Dock 重复坐标数组和空转发函数，保持行为与预算；等待新 head 验收。

## #18 PWA 独立产物治理（2026-11-24）
- 将旧 PWA 变更基于 f39411c 主分支重新整合，保留原 #18 历史；dist 为原 MV3/core，dist-web 为 Pages 网站。原 60.5/156 KiB 预算不变，网站额外 bootstrap <=512 B、额外 JS <=10 KiB、完整网站 <=4 MiB；新增逐文件一致性校验，不能把应用核心挪到 PWA 白名单逃避检查。默认静态入口，主动启用或已注册时才载入离线客户端。离线资源校验、旧版本标签页保护、停用清理与扩展隔离均需专项测试。

- #22 已合并 5060990；#18 首次独立预算实测 bootstrap 411/512 B、附加 JS 10504/10240 B 超 264 B，核心预算通过。改用 SHA-256 Base64 与紧凑资源元组，保留全部逐资源校验，重新集成最新 main。

## Dock 高级动效与性能治理（2026-11-24）
- #22 1c9478d CI 45397869373（677/677）与 UI 45397869367（35/35）通过，原预算通过，squash 5060990，Pages 45398089690 成功。
- Dock 采用 Web Animations API 的 FLIP 重排（外层 entry），内层 icon 保持放大，支持 reduced motion 降级及卸载取消；玻璃底座通过合成层 scaleY 联动；支持 CSS linear() 的浏览器使用弹簧形近似曲线，其余使用 cubic-bezier。尝试合并按需菜单/Dock chunk 减少重复 gzip 开销，不更改核心预算。新增键盘重排与持久化验收。实际构建收益及真机表现待验收。

- #18 5fabc056 CI 45398250251 与 PWA 45398250246 通过，677 单测、4 PWA、1 MV3；bootstrap 411 B、PWA JS 10087 B、网站 1454155 B，合并 e1191f2。#23 首轮 CI 45398379702 678/678 通过，全部核心 JS 155.8 KiB；同步 PWA main，新增日常 CI 网站构建与预算检查，完整 PWA 浏览器验收仍按风险触发。

## V1.7 性能与 PWA 体验候选（2026-11-24）
- #23 9f5d2b7 常规 CI 45398654802（678/678）与 UI 45398654613（36/36）通过，核心 60.5/155.8 KiB、PWA 411/9976 B；合并 a359fdd，Pages 45399558327 成功。
- 新候选将默认隐藏的 SearchBar 延迟加载，保留异步首次聚焦与错误重载；合并相关按需管理辅助模块；PWA 增加安装引导、缓存完整性诊断、联网检查和早期安装提示捕获。预算不变，需重新验证，正式版本尚未发布。

- V1.7.0 候选版本统一 package/lock/MV3 manifest，新增 docs/releases/v1.7.0.md。完整发布验证在候选 PR 和 main 分别运行；main 推送验证成功后专用 publish-v17 job 仅发布 V1.7.0 的已验证网站/扩展 ZIP 和 SHA256SUMS，不覆盖既有 Release。不把候选提交或 Pages 持续预览当作正式 Release。

- #24 首轮 52df0c6 实测首屏 JS 57.8/60.5 KiB、全部 JS 155.3/156 KiB，PWA bootstrap 515/512 B（超 3 B），总 PWA JS 10122/10240 B；676 单测通过、2 项首页搜索用例仍假定同步挂载。改为等待实际异步组件挂载并保留聚焦断言，缩短 bootstrap 重试反馈，补充 UI 风险触发路径；新 head 尚待验收。

## V1.7 完整发布回归修复（2026-11-24）
- #24 7857f81 常规 CI 45400197798：678/678，首屏 57.8/60.5 KiB、全部 155.3/156 KiB，PWA 483/10088 B；UI 45400197942 36/36、PWA 45400198274 5/5 + MV3 1/1 均通过。完整 Release validation 45400197809 169 通过、3 失败，未合并；后续稳定浏览器/生产/MV3 正式步骤未执行。
- 失败原因：全量测试没有限定循环轨道唯一可交互页，触摸第一入口可能是 inert 副本；旧大型日历测试未启用新版默认隐藏的时钟/搜索栏，滚动场景不再明确。保留原验证意图，显式制造短屏溢出并确认页码可见，限定活动页且验证真实命中坐标。生产 useShortcutDrag 修复进入纵向滚动态后后续 pointermove 不更新 scrollTop 的缺陷；新增逐事件单测及三项定向 UI 回归。最新完整验收仍需通过，不提前发布。

## V1.7 生产构建回归与缺陷审计（2026-11-24）
- #24 0d92871：常规 CI 45402172337 679/679；UI 45402172414 36+3；PWA 45402172520 5+1；完整验收 45402172353 的 Chromium 172/172、Chrome/Edge 22/22 通过，生产构建 189 通过、1 失败。失败是旧搜索退出断言假定常驻搜索存在，新增默认隐藏/显式开启两个配置下的失败恢复及焦点回归。MV3 正式步骤尚未执行。
- 审计确认 PWA 检查更新期间 offline 事件可被 finally 无条件启用按钮覆盖；保留检查状态、按连接及控制状态恢复，新增模拟在途更新断网回归。发布改为先草稿上传、实际下载 ZIP 与 SHA256SUMS，比较并校验完整性及 ZIP 结构，通过才公开 Release；既有草稿拒绝覆盖并需显式恢复。保持原核心及网站预算。未完成真机触控/所有安装平台验证。
- 额外审计关注：并发存储使用冲突字段外部更新优先，备份多键持久化并非事务；不能视为强一致或原子恢复。Dock FLIP 与放大在同一时间测量可能引入瞬时几何偏差，列为发布后专项，未宣称已修复。此次不扩大版本功能范围。

## 数据可靠性专项（独立于 V1.7 发布候选）
- 基于 a359fdd 主分支创建独立 PR，等待 #24 完整验收及发布优先收口。备份恢复先用脱离响应式监听的快照完成全量计划，任何后段计算异常不修改 live refs，再按依赖顺序应用；保留旧格式及合并冲突策略。跨标签异步合并完成时清除在等待期间产生的旧写入定时器，按实际合并结果决定是否写回；IndexedDB 打开请求阻塞后如果迟到成功，关闭句柄。
- 新增异常备份无部分修改、异步合并不回写过期状态回归，扩展数据专项 CI 触发路径。此阶段仅保证计划阶段无副作用，不宣称 localStorage 多键写入原子性。后续需要独立设计持久化事务/恢复日志、故障注入、跨标签锁及迁移；不在 V1.7 候选中强制迁移数据。

- #25 625525c：680/680 单测，数据专项 4/4；CI 45404596862 首屏 62190/61952 B 超 238 B，未合并；#24 已有延迟搜索优化但仍在完整发布验收，待合并后同步并重测。新增显式远程删除不复活未提交编辑的回归，以及独立 IndexedDB head/previous 版本 CAS 事务底层和真实浏览器竞争/配额故障注入测试。当前事务模块仅为迁移基础，未接入生产旧键，真实断电及完整迁移仍待验收；详见 docs/workspace-transaction-design.md。保持原预算。

- #24 1d978fc 全量验收 45404033894：679 单元、172 Chromium、22 稳定版、192 生产、1 MV3 均通过，已合并 7625adc；主分支发布待验证。#25 536a187：681 单元、6 数据专项通过，旧 main 首屏 62189/61952 B、全部 159745/159744 B，现同步 V1.7 后重测。不得在 V1.7 发布验收前继续合并。

## 首页 UI 与交互专项（2026-11-24）
- #24 1d978fc 完整验收 45404033894（679 单元、172 Chromium、22 稳定版、192 生产、1 MV3），合并 7625adc；主分支发布仍待验证。#25 同步最新主分支，独立等待数据与预算验收。
- 新 UI 专项：Dock 插入与放大使用稳定布局坐标，不受 FLIP 和插入标记 transform 影响；取消旧动画并清理放大样式；插入反馈使用稳定标线。空白区域触摸跟手预览、取消恢复、模式切换中断；细粒度滚轮跨页保留速度及余量。页码增加轻量对比描边，触屏减少粘滞 hover，保留现有尺寸与主题。新增单元与浏览器回归；非完整物理模拟，真实触控板、高刷新率与实际截图仍需核验，不改变原预算。

## Dock 物理弹簧与交互诊断（2026-11-24）
- #26 05d5884 常规 CI 45406464436（681/681）通过，UI 45406464417 36/37，反向微动被速度预测误判为翻页。保留跨页余量，增加最小预测位移 36px；触摸短时速度投影、跨页残余锚定、低动效回退和停止速度判据。保留旧反向用例。
- Dock 新增逐图标临界阻尼解析求解（速度连续、可重定向、释放回弹），缓存目标布局，静止停止 RAF；底座和间距跟随实际缩放，按左右可用空间限幅，拖拽/重排/禁用/卸载立即清理。新增真实浏览器重定向与裁切测试。轻量首页工具栏材质、焦点及留白优化；不改用户配置和核心预算。帧诊断输出 p95/max/longtask 并保留成功截图报告。真机、高刷新率与原站 1:1 比对未完成。

- Dock 均匀轨道使用首尾布局坐标计算间距，避免每个图标都触发布局读取；UI 主测试与发布定向回归分离报告目录，保留两组诊断附件，成功和失败均上传。

- V1.7 正式 Release 45406123326：主分支 172 Chromium、22 稳定版、192 生产、1 MV3，Tag 7625adc；发布 job 138492255733 实际下载两 ZIP，SHA-256 和 ZIP 结构验证成功后公开。#25 cde89f2 682 单测/6 数据专项通过，合并 8775d70。#26 00db19e UI 45407291840 38+3 通过（帧 p95 16.8ms/max 33.3ms/longtask 0/blank 0/slots 3），常规 45407291800 仅测试回调控制流 TS2349；改为可变容器与 advance helper，不降低断言，并增加速度连续性检查。已下载 14926231483 实际截图，1440×900 默认六列约176px节距偏散；宽屏简洁首页收紧网格宽度，保留配置/窄屏；新增同场景宽度与截图验证、80 帧交替滚动压力/CDP GC 前后堆与 LayerTree 层数诊断。未宣称内存泄漏不存在或真机性能达标；新 head 待 CI，V1.7 Tag 不修改。

- #26 85b7027 常规 45408017049 684/684 但全部 JS 160103/159744 B（+359），UI 45408016947 38+3（Dock hover 首次超时、重试通过）；短时 p95 33.3/max 33.4ms/longtask 0/blank 0/slots 3，80 帧 p95 16.7/max 16.8ms/blank 0/slots 4/layers 15/GC 后堆 11203292→13114204 B，单次差值不证明泄漏。已下载实际报告 14925802624，1440×900 网格横向更紧凑，工作区和顶部工具栏材质继续统一。共享浏览器可选 API 的权限守卫、URL 校验和事件订阅，合并可选数据 chunk（不改变权限申请条件）；需复验预算和扩展。Dock 测试使用稳定布局中心真实鼠标移动并验证 hit target，不强制 hover；压力测试预热后 3 轮 80 帧及 GC 堆趋势。未声称新 head 已通过，保持预算，不扩大正式 V1.7 Tag。真实设备及长时内存仍待验收。

- 共享浏览器权限/URL 守卫及 Vite 分包属于高风险扩展兼容改动；增加 PWA/扩展专项触发路径和生产按需分包完整回归，合并必须等待常规、UI、PWA 三套 CI。两套真实截图基线已核对，优化后网格收紧；本轮新增材质仍待新截图。
