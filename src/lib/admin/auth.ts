// Admin login: one account from env vars, password stored as a scrypt hash,
// session kept in an HMAC-signed, httpOnly cookie.
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET } from 'astro:env/server';

export const SESSION_COOKIE = 'admin_session';
const SESSION_DAYS = 7;

export const authConfigured = () => Boolean(ADMIN_USERNAME && ADMIN_PASSWORD_HASH && ADMIN_SESSION_SECRET);

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** Hash format: scrypt:<salt hex>:<key hex> (see scripts/hash-password.mjs). */
function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, keyHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return safeEqual(actual, expected);
}

export function checkCredentials(username: string, password: string) {
  if (!authConfigured()) return false;
  // Evaluate both checks every time so timing does not reveal which part was wrong.
  const userOk = safeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME!));
  const passOk = verifyPassword(password, ADMIN_PASSWORD_HASH!);
  return userOk && passOk;
}

const sign = (payload: string) => createHmac('sha256', ADMIN_SESSION_SECRET!).update(payload).digest('base64url');

export function startSession(cookies: AstroCookies) {
  const payload = Buffer.from(JSON.stringify({ u: ADMIN_USERNAME, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString('base64url');
  cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function endSession(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function isLoggedIn(cookies: AstroCookies) {
  if (!authConfigured()) return false;
  const value = cookies.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const [payload, sig] = value.split('.');
  if (!payload || !sig || !safeEqual(Buffer.from(sig), Buffer.from(sign(payload)))) return false;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return u === ADMIN_USERNAME && typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}
