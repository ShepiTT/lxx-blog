import type { APIRoute } from 'astro';
import { endSession } from '../../../lib/admin/auth';
import { json } from '../../../lib/admin/http';

export const prerender = false;

export const POST: APIRoute = ({ cookies }) => {
  endSession(cookies);
  return json({ ok: true });
};
