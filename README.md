# Lxx的日常

记录 AI 应用开发的探索，也记录日常与感悟。用 [Astro](https://astro.build) 构建，部署在 Vercel。

正式网址：https://lanjiangtao.cn/ 。RSS 订阅：https://lanjiangtao.cn/rss.xml 。
HTTP 和带 `www` 的地址会跳转到 HTTPS 主域名。

## 功能

- 首页：全屏插画首屏 + 打字机标语 + 绕标题旋转的 3D 标签云 + 波浪过渡；往下滚动时背景视差移动并逐渐变暗、变模糊；文章图文卡片（图片左右交替）+ 右侧侧边栏
- 侧边栏：博主卡片（头像、座右铭、文章/标签/分类数、关注我、社交链接）、公告、最新文章、分类、彩色标签、网站资讯（运行天数、访客数、访问量）
- 文章页：封面横幅、字数 / 阅读时长 / 阅读量、Mac 风格代码块、目录（跟随阅读高亮）、版权信息、上一篇 / 下一篇、Giscus 评论
- 导航：主页、时间轴、更多（标签 / RSS）、分类、相册、说说、友链、留言、关于我、深色模式开关
- 相册（瀑布流 + 点开看大图）、说说（短动态）、友链（含申请说明）、留言板（Giscus）
- 分类页、标签云页、标签页、时间轴、关于我、404
- 搜索（`Ctrl + K`）、深色模式、樱花飘落（右下角可开关）、回到顶部、RSS、sitemap

## 本地开发

Claude Code 的项目交接见 [`CLAUDE.md`](./CLAUDE.md)：Claude 负责本地修改与验证，用户决定上线后由 Codex 检查并发布。开发前先同步远程，保留后台与每日任务新增的内容。

```powershell
npm install
npm run dev
```

打开 http://localhost:4321 。`npm run build` 生成静态文件到 `dist/`。

## 写新文章

### 每日学习自动发布

每天北京时间 13:31 的「每日AI产品架构师学习手册」任务，在核验当期 Word 手册后，同步一篇完整文章到本网站。文章固定使用 `ai-learning-YYYY-MM-DD` 文件名；同一天重跑会核对已有内容，不会重复创建，也不会覆盖手工修改过的文章。

发布器只读手册，通过已登录的 GitHub CLI 提交当天文章到 `ShepiTT/lxx-blog` 的 `main`，随后等待正式网页核验通过。它不会提交本地其他改动，也不需要后台密码。现有 Codex 定时任务在本机运行，需电脑开机、Codex 可运行及联网；已经发布的网页由 Vercel 提供访问。

```powershell
node scripts/publish-learning.mjs --date 2026-10-09 --dry-run
node scripts/publish-learning.mjs --date 2026-10-09 --publish
```

默认使用本机捆绑 Python 和原有 Word 手册路径，迁移电脑时可传入 `--python`、`--docx`。发布回执在忽略版本控制的 `output/learning-publication/`。网站后台发布后，本地仍需先 `git pull` 同步再继续修改。

学习手册第 1–17 期已按原始日期（2026-09-18 至 2026-10-09）整理为每日文章。首页和时间轴按日期倒序显示；手册中没有内容的日期不补造文章。历史导出使用 `export-learning.py --history` 兼容早期字段名称，正文保持原文，摘要从原导语或讲解中摘取；日常发布仍使用默认严格校验。

在 `src/content/blog/` 新建 `.md` 文件，文件名就是文章网址（`my-post.md` → `/posts/my-post/`）：

```markdown
---
title: 文章标题
description: 一两句话的摘要，会显示在卡片和搜索结果里
date: 2026-10-10
category: ai          # ai / daily / thoughts，见 src/site.config.ts
tags: [RAG, LLM]
cover: /covers/my-post.jpg   # 封面放在 public/covers/，建议横图 16:10
draft: false          # 设为 true 时只在本地预览中显示
---

正文用 Markdown 写，## 二级标题会自动进入目录。
```

## 发说说、加照片、加友链

- **说说**：在 `src/content/talks/` 新建一个 `.md` 文件，开头写 `date`（如 `2026-10-10T20:30:00+08:00`），可选 `images`（配图路径列表）和 `tags`，下面写正文。
- **相册**：编辑模式里在相册页上传；也可以把照片放进 `public/album/` 后在 `src/data/album.json` 里登记。
- **友链**：编辑模式里在友链页添加；也可以改 `src/data/links.json`。
- **留言板**：和文章评论一样用 Giscus，配好 `GISCUS` 后自动可用。
- **GitHub 项目**：「关于我」页的「我的项目」来自 `src/data/projects.json`。GitHub 上新建或更新了公开项目后，运行 `npm run projects:sync` 重新拉取（只收录自己名下、非 fork、未归档的公开仓库），再上线即可。

## 换成你自己的图片和信息

现在的图片都是占位插画，替换方法：

| 内容 | 怎么换 |
| --- | --- |
| 首屏大图（也用于侧边栏、页脚、各页面横幅） | 放进 `public/images/`，在编辑模式里点「更换首屏图」，或改 `src/data/site.json` 的 `heroImage`。建议 1920×1080 以上的横图 |
| 头像（也是浏览器标签页图标） | 编辑模式里点头像上传，或改 `src/data/site.json` 的 `avatar`。建议正方形 |
| 文章封面 | 放进 `public/covers/`，改文章开头的 `cover` |
| 标语、座右铭、公告、建站日期、社交链接 | 编辑模式里直接改，或改 `src/data/site.json` |
| 评论（Giscus） | 到 https://giscus.app/zh-CN 生成配置，填进 `GISCUS` |
| 个人介绍（「关于我」页） | 编辑模式里点介绍卡片，或改 `src/data/site.json` 的 `intro` |
| 正式域名 | `astro.config.mjs` 的 `site` |

访问量统计用的是 [vercount](https://vercount.one)（兼容不蒜子的第三方服务）。本地预览不加载统计脚本，显示「本地不统计」；线上按正式域名统计。

## 在网站上直接编辑

登录后台后再打开博客，右下角会多一个铅笔按钮（访客看不到）。打开「编辑模式」后：

- 带虚线框的内容点一下就能改：网站标题、作者名、座右铭、公告、首屏标语、建站日期、头像、社交链接；
- 「关于我」页点个人介绍卡片可以修改身份、介绍、技能、现在在做和邮箱；相册页可以新建相册、上传照片、改说明；友链页可以增删友链；
- 文章卡片和说说上会出现「编辑 / 删除」，底部工具栏有「站点设置」「更换首屏图」「写文章」「发说说」。

这些内容保存在 `src/data/` 里（`site.json`、`links.json`、`album.json`），也可以直接改文件。

## 后台管理（/admin）

在网站地址后面加 `/admin` 登录后台，可以写文章、发说说、上传图片、编辑和删除。

- **线上**：保存后会提交到 GitHub 仓库，Vercel 自动重新部署，大约 1 分钟后网站更新。在别处（手机、其他电脑）发布后，本地要先 `git pull` 再改代码。
- **本地**：不同时配置 `GITHUB_TOKEN` 和 `GITHUB_REPO` 时，直接保存到电脑上的项目文件。两者齐全时，即使运行 `npm run dev`，后台仍会写入 GitHub 并可能触发上线；Astro 会自动读取 `.env`，本地写入测试应在隔离进程里显式用空值覆盖这两个变量，或隔离 `envDir`，并先确认使用本地文件存储，保留原 `.env` 文件。源码修改由 Codex 按用户上线指令提交推送。

需要的环境变量（本地写在 `.env`，线上在 Vercel 项目 Settings → Environment Variables）：

| 变量 | 说明 |
| --- | --- |
| `ADMIN_USERNAME` | 后台账号 |
| `ADMIN_PASSWORD_HASH` | 密码的哈希，用 `npm run admin:password` 生成（不要直接填明文密码） |
| `ADMIN_SESSION_SECRET` | 登录状态的签名密钥，随机字符串，`npm run admin:password -- --with-secret` 会一起生成 |
| `GITHUB_TOKEN` | GitHub 细粒度令牌，只授权博客仓库的 Contents 读写 |
| `GITHUB_REPO` | 仓库，例如 `ShepiTT/lxx-blog` |
| `GITHUB_BRANCH` | 分支，默认 `main` |

改密码：运行 `npm run admin:password`，把输出的 `ADMIN_PASSWORD_HASH` 同时更新到 `.env` 和 Vercel，再重新部署。

## 部署

```powershell
vercel deploy --prod --yes --scope shepi-tt
```

Vercel 会自动执行 `npm run build`：博客页面是静态的，只有后台和后台接口以 Vercel 函数运行。

> Windows 上项目路径含中文时，Node 22 的 `fs.cpSync` 会崩溃，`npm run build` 通过 `scripts/fix-cpsync-windows.mjs` 绕开了这个问题；直接运行 `astro build` 可能会失败。
