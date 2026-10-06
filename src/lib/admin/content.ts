// Turns blog posts and talks into Markdown files (frontmatter + body) and back.
import { parse, stringify } from 'yaml';
import { CATEGORIES } from '../../site.config';

export type ItemType = 'blog' | 'talks';

export const DIRS: Record<ItemType, string> = {
  blog: 'src/content/blog',
  talks: 'src/content/talks',
};

export const isItemType = (t: unknown): t is ItemType => t === 'blog' || t === 'talks';

// File names become URLs (/posts/<id>/), so keep them to lowercase letters, digits and dashes.
export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(id);

export const itemPath = (type: ItemType, id: string) => `${DIRS[type]}/${id}.md`;

export interface BlogData {
  title: string;
  description: string;
  date: string;
  category: string;
  tags: string[];
  cover: string;
  draft: boolean;
}

export interface TalkData {
  date: string;
  images: string[];
  tags: string[];
}

const toDateString = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
};

export function parseMarkdown(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {} as Record<string, unknown>, body: source };
  return { data: (parse(match[1]) ?? {}) as Record<string, unknown>, body: match[2].replace(/^\r?\n/, '') };
}

export function serializeMarkdown(data: object, body: string) {
  return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

const strings = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);

/** Validates what the editor sent and returns clean frontmatter, or an error message. */
export function cleanData(type: ItemType, raw: Record<string, unknown>): { data: BlogData | TalkData } | { error: string } {
  if (type === 'blog') {
    const title = String(raw.title ?? '').trim();
    const description = String(raw.description ?? '').trim();
    const date = String(raw.date ?? '').trim();
    const category = String(raw.category ?? '');
    const cover = String(raw.cover ?? '').trim();
    if (!title) return { error: '请填写标题' };
    if (!description) return { error: '请填写摘要' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: '日期格式应为 2026-10-10' };
    if (!CATEGORIES.some((c) => c.id === category)) return { error: '请选择分类' };
    if (!cover) return { error: '请上传或填写封面图' };
    return { data: { title, description, date, category, tags: strings(raw.tags), cover, draft: Boolean(raw.draft) } };
  }
  const date = String(raw.date ?? '').trim();
  if (Number.isNaN(Date.parse(date))) return { error: '时间格式不正确' };
  return { data: { date, images: strings(raw.images), tags: strings(raw.tags) } };
}

/** Summary used by the dashboard list. */
export function summarize(type: ItemType, id: string, source: string) {
  const { data, body } = parseMarkdown(source);
  if (type === 'blog') {
    return {
      id,
      title: String(data.title ?? id),
      date: toDateString(data.date).slice(0, 10),
      category: String(data.category ?? ''),
      draft: Boolean(data.draft),
    };
  }
  return { id, title: body.replace(/\s+/g, ' ').trim().slice(0, 60) || '（只有图片）', date: toDateString(data.date), category: '', draft: false };
}

export { toDateString };
