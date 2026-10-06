import { StorageError } from './storage';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

/** Turns thrown errors into JSON responses the admin UI can show. */
export async function handle(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof StorageError) return fail(err.message, err.status);
    console.error(err);
    return fail('服务器出错了，请稍后再试', 500);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}
