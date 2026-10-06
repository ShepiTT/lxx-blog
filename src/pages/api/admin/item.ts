import type { APIRoute } from 'astro';
import { cleanData, isItemType, isValidId, itemPath, serializeMarkdown } from '../../../lib/admin/content';
import { fail, handle, json, readJson } from '../../../lib/admin/http';
import { getStorage } from '../../../lib/admin/storage';

export const prerender = false;

const label = (type: string, data: { title?: string }, id: string) => (type === 'blog' ? `文章《${data.title ?? id}》` : `说说 ${id}`);

// Create or update a post / talk.
export const PUT: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request);
  const { type, id, isNew, sha } = body ?? {};
  if (!isItemType(type)) return fail('类型不正确');
  if (!isValidId(id)) return fail('文章地址只能用小写字母、数字和短横线，例如 my-first-post');
  const result = cleanData(type, (body?.data as Record<string, unknown>) ?? {});
  if ('error' in result) return fail(result.error);

  const storage = getStorage();
  const path = itemPath(type, id);
  if (isNew && (await storage.read(path))) return fail('这个地址已经被别的内容用了，换一个吧', 409);

  const content = serializeMarkdown(result.data, String(body?.body ?? ''));
  await storage.write(path, content, `后台${isNew ? '新增' : '更新'}${label(type, result.data as { title?: string }, id)}`, {
    sha: isNew ? undefined : String(sha ?? ''),
  });
  return json({ ok: true, mode: storage.mode });
});

export const DELETE: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request);
  const { type, id } = body ?? {};
  if (!isItemType(type) || !isValidId(id)) return fail('参数不正确');
  const storage = getStorage();
  const file = await storage.read(itemPath(type, id));
  if (!file) return fail('内容不存在，可能已经删除了', 404);
  await storage.remove(file.path, `后台删除${type === 'blog' ? '文章' : '说说'} ${id}`, file.sha);
  return json({ ok: true, mode: storage.mode });
});
