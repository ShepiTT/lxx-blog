import type { APIRoute } from 'astro';
import { json } from '../../../lib/admin/http';
import { getStorage } from '../../../lib/admin/storage';

export const prerender = false;

// Reaching this handler means the middleware accepted the session cookie.
export const GET: APIRoute = () => {
  let mode = 'unconfigured';
  try {
    mode = getStorage().mode;
  } catch {}
  return json({ loggedIn: true, mode });
};
