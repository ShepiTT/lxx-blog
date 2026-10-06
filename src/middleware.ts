import { defineMiddleware } from 'astro:middleware';
import { isLoggedIn } from './lib/admin/auth';

// Everything under /admin and /api/admin needs a valid session, except the login page and login API.
export const onRequest = defineMiddleware((context, next) => {
  const path = context.url.pathname;
  const adminPage = path.startsWith('/admin') && !path.startsWith('/admin/login');
  const adminApi = path.startsWith('/api/admin/') && !path.startsWith('/api/admin/login');
  if ((adminPage || adminApi) && !isLoggedIn(context.cookies)) {
    if (adminApi) {
      return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    return context.redirect('/admin/login/');
  }
  return next();
});
