// 全站配置：改这里即可更新标题、简介、图片、分类、社交链接和评论。

export const SITE = {
  title: 'Lxx的日常',
  author: 'Lxx',
  description: '记录 AI 应用开发的探索，也记录日常与感悟。写给程序员，也写给对 AI 感兴趣的你。',
  // 侧边栏头像下方的一句话
  motto: '和 AI 一起写代码，也认真生活。',
  // 首屏标语，会一句一句循环打出来
  typewriter: ['相信记录的力量。', '和 AI 一起写代码，也认真生活。', '今天也在认真踩坑和填坑。'],
  // 侧边栏公告
  notice: '欢迎来到我的小站！这里记录 AI 应用开发的探索，也有日常和感悟。读完有想法的话，欢迎在文章下面留言～',
  // TODO：以下图片目前是占位图，换成你自己的图片后改这里的路径
  avatar: '/avatar.svg',
  heroImage: '/images/hero.jpg',
  // 建站日期，用来计算「本站已运行」天数
  startDate: '2026-10-06',
  lang: 'zh-CN',
};

// 分类 id 会出现在网址里（/category/ai/），只用小写字母和短横线。
export const CATEGORIES = [
  { id: 'ai', name: 'AI 应用开发', description: '大模型、RAG、Agent 与提示词工程的一线实践。' },
  { id: 'daily', name: '日常', description: '写代码之外的生活片段。' },
  { id: 'thoughts', name: '感悟', description: '关于技术、成长与 AI 时代的思考。' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

// TODO：把 href 换成你的真实链接；不需要的平台直接删掉那一行。
export const SOCIALS = [
  { name: 'GitHub', href: '#', icon: 'github' },
  { name: 'X', href: '#', icon: 'x' },
  { name: '公众号', href: '#', icon: 'wechat' },
  { name: '邮箱', href: '#', icon: 'mail' },
  { name: 'RSS', href: '/rss.xml', icon: 'rss' },
] as const;

// Giscus 评论：在 https://giscus.app/zh-CN 选择你的公开仓库（需开启 Discussions），
// 把页面生成的 data-repo、data-repo-id、data-category、data-category-id 填到这里。
export const GISCUS = {
  repo: '',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};
