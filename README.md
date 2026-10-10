# inftab-mirror

Infinity New Tab（`inftab.com`）的 **1:1 静态镜像**，可直接托管在 GitHub Pages 等任意静态空间。

## 这是什么

[Infinity New Tab](https://inftab.com/) 是一个 Vue SPA 风格的新标签页应用。本仓库通过
「下载构建产物 + 本地重新托管」的方式完成了对它的完整镜像：

- 所有 JS/CSS 构建产物、图片、字体、webpack 动态 chunk 均已下载到本地；
- 原站引用的 3 个 CDN 域（`infinityicon` / `infinity-permanent` / `infinitypro-img`）已本地化到 `cdn/<host>/`；
- 所有**根绝对路径**（`/cdn/`、`/vendor/`、`/newtab/`、`/_locales/`、webpack `publicPath` 等）
  均改写为**相对路径** `./`，因此可部署在任意子路径（如 GitHub Pages 的 `/<repo>/`）。

## 目录结构

```
index.html                 入口页面
newtab/                   主入口 chunk
*.js                      根级 webpack 动态 chunk（按需加载）
vendor/                   spec / color-thief / color-picker / vue
cdn/                      3 个 CDN 域的本地化资源（112 个文件）
images/                   站点静态图片
_locales/                 多语言 messages
icon/                     favicon
serviceworker.js          已禁用注册（避免子路径 scope 报错）
.nojekyll                 GitHub Pages 关闭 Jekyll，保留 _locales 等下划线目录
```

## 本地预览

由于浏览器对 `file://` 的模块/抓取限制，请用任意静态服务器（不要用双击打开）：

```bash
# 任选其一
python3 -m http.server 8080
npx serve .
```

然后访问 `http://localhost:8080/`。

## 部署到 GitHub Pages

本仓库已适配子路径部署，直接推送 `main` 分支并在仓库
Settings → Pages 选择 `main` / `root` 即可。站点地址形如
`https://<user>.github.io/inftab-mirror/`。

> 说明：页面运行时仍会调用 `api.inftab.com` 的两个**动态数据接口**（搜索建议、通知列表），
> 这是数据而非静态资源，联网时正常返回 200。其余所有静态资源均已本地化。

## 复刻说明

站点通过无头 Chromium 真实加载、监听网络请求，递归补齐动态 chunk 与运行时拼接资源，
反复迭代直到本地缺失资源为 0、控制台错误为 0。
