// 留言板接口：GET 读取留言，POST 发留言（任何访客都能调用，所以每一步都按不可信输入处理）。
import type { APIRoute } from 'astro';
import { fail, json } from '../../lib/admin/http';
import { addMessage, listMessages, MessageError } from '../../lib/messages';

export const prerender = false;

const MAX_BODY = 2048;

/** Bound bytes while reading, before a large request is buffered as text. */
async function readBody(request: Request) {
  const size = Number(request.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_BODY) throw new MessageError('内容太长了', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) {
        await reader.cancel().catch(() => {});
        throw new MessageError('内容太长了', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

// Visitors only see our own wording; storage / GitHub details stay in the server log.
async function guard(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof MessageError) return fail(err.message, err.status);
    console.error('guestbook:', err);
    return fail('留言板暂时不可用，请稍后再试', 503);
  }
}

export const GET: APIRoute = () => guard(async () => {
  const messages = await listMessages();
  return new Response(JSON.stringify({ messages }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Browsers always ask again (so a reload shows new messages); Vercel's edge cache answers most of
      // those asks for a few seconds so GitHub isn't called on every visit.
      'Cache-Control': 'no-cache',
      'Vercel-CDN-Cache-Control': 'max-age=10, stale-while-revalidate=60',
    },
  });
});

export const POST: APIRoute = ({ request, clientAddress }) => guard(async () => {
  // Only our own page may post: JSON from the same origin.
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return fail('请求格式不正确', 415);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('请求来源不正确', 403);

  const raw = await readBody(request);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return fail('请求格式不正确', 400);
  }

  // Bots: a hidden field people never fill in, and forms sent back faster than anyone can type.
  if (body.website) return fail('提交失败', 400);
  if (typeof body.elapsed !== 'number' || !Number.isFinite(body.elapsed) || body.elapsed < 2000) {
    return fail('写得太快啦，再检查一下吧', 400);
  }

  let ip = '';
  try { ip = clientAddress; } catch {}
  ip ||= request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  const message = await addMessage(body, ip);
  return json({ message }, 201);
});
