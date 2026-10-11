# Claude 本地开发交接

用户确定的协作方式：Claude Code 负责这个目录的本地开发和验证；用户确认要上线后，由 Codex 同步、检查和发布到现有正式网站。

## 当前项目

- 工作目录：`D:\lxx\个人博客`。
- 正式网站：<https://lanjiangtao.cn/>；`www` 和 HTTP 跳转到 HTTPS 主域名。
- 仓库：`ShepiTT/lxx-blog`，远程 `origin`，生产分支 `main`。
- Vercel：团队 `shepi-tt`，项目 `shepitt`，Hobby 套餐。
- Astro 7 博客。博客页面预渲染；`/admin` 和 `/api/admin` 由 Vercel 函数运行。
- 2026-10-10 交接时，本地已同步至 `2eae3da`，包含第 1–18 期学习文章（2026-09-18 至 2026-10-10）和当天后台修改的站点设置。这是交接快照，开始工作时仍须重新核对远程。

## 本地开发流程

1. 开始前查看 `git status`。工作树干净时用 `git pull --ff-only` 同步；若有未提交修改或分支分叉，先保护并核对现有工作，再处理同步，不要硬重置或覆盖。
2. 依赖缺失时运行 `npm install`，启动使用 `npm run dev`，本地预览 <http://localhost:4321/>。
3. 直接修改源码和内容文件，按用户要求做本地开发。构建使用 **`npm run build`**。
4. 保留 `scripts/fix-cpsync-windows.mjs` 和 build 脚本中的预载设置；Windows 中文目录下直接运行 `astro build` 曾导致 `fs.cpSync` 崩溃。
5. 完成后给出修改文件、效果、已执行的验证和待解决项，保留本地改动交给 Codex 发布。默认不自动 commit、push、执行生产部署或运行学习发布器的 `--publish`；用户新的明确指令优先。

## 文件位置

| 内容 | 路径 |
| --- | --- |
| 页面、布局、组件 | `src/pages/`、`src/layouts/`、`src/components/` |
| 文章 / 说说 | `src/content/blog/`、`src/content/talks/` |
| 站点资料（含「关于我」页的个人介绍 `intro`）、友链、相册 | `src/data/site.json`、`src/data/links.json`、`src/data/album.json` |
| 图片与静态资源 | `public/` |
| 内容 schema | `src/content.config.ts` |
| 站点分类等配置 | `src/site.config.ts` |
| 域名、Markdown、适配器 | `astro.config.mjs` |
| 后台存储选择 | `src/lib/admin/storage.ts` |
| 学习手册导出与发布 | `scripts/export-learning.py`、`scripts/publish-learning.mjs` |

## 本地后台可能写入线上

`getStorage()` 优先使用 `GITHUB_TOKEN` + `GITHUB_REPO`。即使地址是 localhost，带着这两个变量运行时，后台保存也会提交到 GitHub；提交到 `main` 随即触发生产部署。

本地开发优先直接改文件。若必须测试本地后台写入，保留原有 `.env` 文件和后台登录配置，仅在隔离的测试进程中显式用空值覆盖这两个 GitHub 变量，或使用隔离的 `envDir`。Astro 会自动加载 `.env`，仅从 shell 移除变量可能让令牌被重新加载；执行后台写入前必须确认选择的是本地文件存储。不要调用生产后台做开发测试，也不要为了测试更改或打印真实密钥。

## 每日学习文章与远程同步

- 每天北京时间 13:31 的既有 Codex 学习任务，先更新和核验原 Word 手册，再经发布器直接提交当天文章至 `main`，并核验正式网页。任务依赖本机开机、Codex 可运行和联网。
- 文章文件名为 `ai-learning-YYYY-MM-DD.md`，使用原始日期；首页和时间轴最新在前。没有原始内容的日期不补造文章。已有示例内容已清空，不恢复旧示例。
- 保留六知识点校验、练习答案、同日重复保护、内容哈希和线上回读。历史兼容仅由导出器的 `--history` 开启，日常严格校验继续保留。
- 原 Word 手册位于 `C:\Users\Administrator\Documents\Codex\2026-09-05\new-chat\outputs\AI产品架构师每日学习手册.docx`，博客开发不要修改原手册。
- 后台编辑和每日任务会在其他地方更新远程 `main`。开始开发、交接和正式发布前都应检查远程变化，保护新文章及站点设置，解决冲突后再发布。

## 发布交接给 Codex

用户在 Codex 说“把 Claude 的改动上线”后，Codex 检查本地 diff、同步远程新增内容、执行 `npm run build` 和适当检查，再推送到 `main`。Vercel 自动构建发布，最终确认生产部署 READY、正式域名和改动效果。

正式站点继续使用 `astro.config.mjs` 的 `https://lanjiangtao.cn`，供 RSS、sitemap 和分享链接使用。文章、站点设置和后台上传的图片保存在 GitHub 仓库中，Vercel 提供部署后的访问；当前实现未使用独立数据库或 Vercel Blob。

不要提交或披露 `.env*`、GitHub/Vercel 令牌、后台凭据。保留现有 `.gitignore` 对 `node_modules/`、`.vercel/`、`dist/`、`.astro/`、`output/` 和 `__pycache__/` 的排除。
