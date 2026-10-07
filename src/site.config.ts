// 站点信息、社交链接存在 src/data/site.json，可以在网站的编辑模式里直接修改。
// 分类和评论配置涉及网址结构，仍在这里用代码维护。
import siteJson from './data/site.json';
import type { SiteData } from './lib/site-data';

const site = siteJson as SiteData;

export const SITE = { ...site, lang: 'zh-CN' };

// 分类 id 会出现在网址里（/category/ai/），只用小写字母和短横线。
export const CATEGORIES = [
  { id: 'ai', name: 'AI 应用开发', description: '大模型、RAG、Agent 与提示词工程的一线实践。' },
  { id: 'daily', name: '日常', description: '写代码之外的生活片段。' },
  { id: 'thoughts', name: '感悟', description: '关于技术、成长与 AI 时代的思考。' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const SOCIALS = site.socials;

// Giscus 评论：在 https://giscus.app/zh-CN 选择你的公开仓库（需开启 Discussions），
// 把页面生成的 data-repo、data-repo-id、data-category、data-category-id 填到这里。
export const GISCUS = {
  repo: '',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};
