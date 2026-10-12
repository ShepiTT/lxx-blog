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
    // 可选。不填就不显示图片（卡片左侧显示日期）；填写时放在 public/ 下，例如 /uploads/... 或 /covers/...
    cover: z.string().optional(),
    draft: z.boolean().default(false),
    learningContentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }),
});

export const collections = { blog };
