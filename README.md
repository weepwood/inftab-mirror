# inftab-mirror

Infinity New Tab 的可维护前端重建。页面使用 Vue 3、TypeScript 和 Vite；原静态镜像保存在 `reference/legacy-mirror/`，作为视觉、资源和行为对照。

## 本地开发

需要 Node.js 20.19+、22.12+ 或 24+。

```sh
npm install
npm run dev
```

Vite 会在终端输出本地预览地址。生产构建和本地预览：

```sh
npm run build
npm run preview
```

GitHub Pages 使用 `dist/` 作为发布目录。首次部署前，在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。之后推送到 `main` 会自动构建并发布；也可以在 Actions 页面手动运行工作流。`vite.config.ts` 使用相对资源路径，支持部署在仓库子路径下。

## 项目结构

```text
src/
  components/       搜索栏、快捷入口、设置、待办、笔记、天气面板
  composables/      本地工作区状态和浏览器存储
  data/             默认快捷入口、搜索引擎、搜索地址和外观选项
  styles/           页面与响应式样式
  App.vue           页面状态和功能组合
  main.ts           应用入口
public/
  wallpapers/       本地壁纸
  inftab-icons/     旧镜像中的常用站点和内置图标
  search-engines/   搜索引擎标识
  windmill.svg      页面装饰图标
reference/
  legacy-mirror/    原始打包版镜像，仅用于对照
```

## 已实现

- 百度、Google、Bing、搜狗、360、Yahoo 和 DuckDuckGo 搜索；支持网页、图片、新闻、视频和地图分类
- 快捷入口的添加、编辑、删除、拖动排序和分页
- 默认入口优先使用旧镜像保存的站点图标；自定义入口支持指定图标图片
- 本地待办与笔记
- 壁纸选择、背景暗度、图标大小/圆角、网格列数和名称显示设置
- 天气入口：输入城市后打开天气搜索结果
- 个人设置、快捷入口、待办和笔记保存于当前浏览器的 `localStorage`

## 当前边界

此版本重建的是前端交互。原站账号、云同步、原站搜索建议/通知和其他需要原站服务的功能尚未接入；天气入口使用搜索结果，不请求设备位置。持久化数据只保存在本机浏览器。

新功能优先放在 `src/components/`、`src/data/` 或新的功能模块中，不直接修改 `reference/legacy-mirror/` 内的压缩构建文件。
