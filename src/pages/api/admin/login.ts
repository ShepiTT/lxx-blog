import type { APIRoute } from 'astro';
import { authConfigured, checkCredentials, startSession } from '../../../lib/admin/auth';
import { fail, json, readJson } from '../../../lib/admin/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!authConfigured()) return fail('后台账号还没有配置（ADMIN_USERNAME / ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET）', 503);
  const body = await readJson(request);
  const username = String(body?.username ?? '');
  const password = String(body?.password ?? '');
  if (!checkCredentials(username, password)) {
    // Slow down password guessing.
    await new Promise((r) => setTimeout(r, 800));
    return fail('账号或密码错误', 401);
  }
  startSession(cookies);
  return json({ ok: true });
};
