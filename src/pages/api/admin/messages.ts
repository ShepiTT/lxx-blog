// Delete a guestbook message (admin only; the middleware checks the session).
import type { APIRoute } from 'astro';
import { fail, handle, json, readJson } from '../../../lib/admin/http';
import { deleteMessage } from '../../../lib/messages';

export const prerender = false;

export const DELETE: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request);
  if (typeof body?.id !== 'string') return fail('参数不正确');
  await deleteMessage(body.id);
  return json({ ok: true });
});
