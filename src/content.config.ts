import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORIES } from './site.config';

const categoryIds = CATEGORIES.map((c) => c.id) as [string, ...string[]];

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(categoryIds),
    tags: z.array(z.string()).default([]),
    // 封面图放在 public/covers/ 下，这里写 /covers/文件名
    cover: z.string(),
    draft: z.boolean().default(false),
    learningContentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }),
});

// 说说：短动态，每条一个 .md 文件，放在 src/content/talks/
const talks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/talks' }),
  schema: z.object({
    date: z.coerce.date(),
    // 配图放在 public/ 下，写路径即可，最多建议 9 张
    images: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog, talks };
