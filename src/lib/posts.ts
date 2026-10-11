import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES } from '../site.config';

export type Post = CollectionEntry<'blog'>;

/** Published posts, newest first. Drafts only show up in `npm run dev`. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const postUrl = (post: Post) => `/posts/${post.id}/`;

export const tagUrl = (tag: string) => `/tags/${encodeURIComponent(tag)}/`;

export const categoryUrl = (id: string) => `/category/${id}/`;

export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

// Dates come from YAML as UTC midnight, so read them back in UTC.
export const formatDate = (date: Date) =>
  `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Plain text of a Markdown body, for reading time and search. */
export const plainText = (markdown = '') =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const wordCount = (markdown = '') => plainText(markdown).replace(/\s/g, '').length;

// Chinese prose reads at roughly 400 characters per minute.
export const readingMinutes = (markdown = '') => Math.max(1, Math.round(wordCount(markdown) / 400));

/** Tags with post counts, most used first. */
export function tagCounts(posts: Post[]) {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
}

// ---------- Pagination ----------
export const PAGE_SIZE = 6;

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

export const pageSlice = <T>(items: T[], page: number) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

/** Page 1 lives at the list's own URL; later pages at <base>page/N/. */
export const pageUrl = (base: string, page: number) => (page <= 1 ? base : `${base}page/${page}/`);
