import type { APIRoute } from 'astro';
import { fail, handle, json, readJson } from '../../../lib/admin/http';
import { getStorage } from '../../../lib/admin/storage';

export const prerender = false;

const ALLOWED = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const MAX_BYTES = 3 * 1024 * 1024;

// Saves an image under public/uploads/<year>/<month>/ and returns its URL.
export const POST: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request);
  const name = String(body?.name ?? '');
  const data = String(body?.data ?? '');
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED.includes(ext)) return fail('只支持 jpg、png、webp、gif 图片');
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return fail('图片数据不正确');
  if (Buffer.byteLength(data, 'base64') > MAX_BYTES) return fail('图片太大了（压缩后不能超过 3 MiB，GIF 需先压缩）');

  const now = new Date();
  const folder = `public/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const file = `${now.getTime().toString(36)}-${base}.${ext === 'jpeg' ? 'jpg' : ext}`;

  const storage = getStorage();
  await storage.write(`${folder}/${file}`, data, `后台上传图片 ${file}`, { base64: true });
  return json({ ok: true, url: `${folder.replace(/^public/, '')}/${file}`, mode: storage.mode });
});
