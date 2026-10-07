import type { APIRoute } from 'astro';
import { DATA_FILES, type DataFileName } from '../../../lib/site-data';
import { fail, handle, json, readJson } from '../../../lib/admin/http';
import { getStorage } from '../../../lib/admin/storage';

export const prerender = false;

const isDataFile = (name: unknown): name is DataFileName => typeof name === 'string' && name in DATA_FILES;
const isMarkdown = (name: DataFileName) => DATA_FILES[name].path.endsWith('.md');

// Read the current version of an editable data file (site settings, links, album, about).
export const GET: APIRoute = ({ url }) => handle(async () => {
  const name = url.searchParams.get('file');
  if (!isDataFile(name)) return fail('未知的数据文件');
  const file = await getStorage().read(DATA_FILES[name].path);
  if (!file) return fail('数据文件不存在', 404);
  return json({ data: isMarkdown(name) ? file.content : JSON.parse(file.content), sha: file.sha });
});

// Validate and save a data file. `sha` must match the version that was read, so two
// editors (or the editor and a deploy) can't silently overwrite each other.
export const PUT: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request);
  const name = body?.file;
  if (!isDataFile(name)) return fail('未知的数据文件');
  const parsed = DATA_FILES[name].schema.safeParse(body?.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? '内容格式不正确');
  }
  const content = isMarkdown(name) ? `${String(parsed.data).trim()}\n` : `${JSON.stringify(parsed.data, null, 2)}\n`;
  const storage = getStorage();
  await storage.write(DATA_FILES[name].path, content, `网站编辑模式：修改${DATA_FILES[name].label}`, { sha: String(body?.sha ?? '') });
  return json({ ok: true, mode: storage.mode });
});
