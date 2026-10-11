// Shapes of the editable data files in src/data/. The site reads them at build time;
// the admin API validates edits against the same schemas before saving.
import { z } from 'astro/zod';

export const SOCIAL_ICONS = ['github', 'x', 'wechat', 'mail', 'rss', 'bilibili', 'link'] as const;

// Links may be absolute http(s), mailto:, a site path, or "#" as a placeholder.
const href = z.string().trim().max(300).regex(/^(https?:\/\/|mailto:|\/|#)/, '链接需以 http(s)://、mailto:、/ 或 # 开头');
// Images are site paths (/uploads/...) or absolute http(s) URLs.
const image = z.string().trim().max(300).regex(/^(https?:\/\/|\/)/, '图片地址需以 / 或 http(s):// 开头');
const text = (max: number) => z.string().trim().max(max, `不能超过 ${max} 个字`);

export const siteSchema = z.object({
  title: text(40).min(1, '标题不能为空'),
  author: text(30).min(1, '作者名不能为空'),
  description: text(200),
  motto: text(60),
  typewriter: z.array(text(40).min(1)).min(1, '至少保留一句标语').max(10),
  notice: text(300),
  avatar: image,
  heroImage: image,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 2026-10-06'),
  socials: z.array(z.object({ name: text(20).min(1), href, icon: z.enum(SOCIAL_ICONS) })).max(12),
  // 首页个人介绍板块；text 里用空行分段。
  intro: z.object({
    role: text(40),
    text: text(800),
    skills: z.array(text(20).min(1)).max(16),
    now: z.array(text(60).min(1)).max(8),
    email: z.string().trim().max(100).regex(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'),
  }).optional(),
});

export const linksSchema = z.array(z.object({
  name: text(40).min(1, '友链名称不能为空'),
  url: z.string().trim().max(300).regex(/^https?:\/\//, '友链网址需以 http(s):// 开头'),
  avatar: image,
  description: text(60),
})).max(200);

export const albumSchema = z.array(z.object({
  name: text(30).min(1, '相册名称不能为空'),
  description: text(100),
  photos: z.array(z.object({ src: image, caption: text(60).optional() })).max(300),
})).max(50);

export type SiteData = z.infer<typeof siteSchema>;
export type FriendLink = z.infer<typeof linksSchema>[number];
export type Album = z.infer<typeof albumSchema>[number];

/** Editable files, keyed by the name the admin API uses. */
export const DATA_FILES = {
  site: { path: 'src/data/site.json', schema: siteSchema, label: '站点设置' },
  links: { path: 'src/data/links.json', schema: linksSchema, label: '友链' },
  album: { path: 'src/data/album.json', schema: albumSchema, label: '相册' },
} as const;

export type DataFileName = keyof typeof DATA_FILES;
