import { credentialVersion, refreshSharedUser } from './fizmat';
import type { Env, UserRow } from './types';
import { bearer, bytesToBase64, now, randomToken, sha256 } from './util';

// Cloudflare Workers WebCrypto currently caps PBKDF2 at 100,000 rounds.
const iterations = 100_000;
export async function hashPassword(password: string, suppliedSalt?: string) {
  const salt = suppliedSalt
    ? Uint8Array.from(atob(suppliedSalt.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
        c.charCodeAt(0),
      )
    : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    256,
  );
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(result))}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [kind, rounds, salt] = encoded.split('$');
  if (kind !== 'pbkdf2' || Number(rounds) !== iterations || !salt) return false;
  return (await hashPassword(password, salt)) === encoded;
}
export async function createLogin(env: Env, userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first<UserRow>();
  await env.DB.prepare(
    'INSERT INTO auth_sessions(token_hash,user_id,expires_at,credential_version) VALUES(?,?,?,?)',
  )
    .bind(await sha256(token), userId, expires, user ? await credentialVersion(env, user) : null)
    .run();
  return token;
}
export async function currentUser(env: Env, request: Request): Promise<UserRow | null> {
  const token = bearer(request);
  if (!token) return null;
  const user = await env.DB.prepare(
    `SELECT u.*,s.credential_version FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
  )
    .bind(await sha256(token), now())
    .first<UserRow & { credential_version: string | null }>();
  return user ? refreshSharedUser(env, user, user.credential_version) : null;
}
export async function requireUser(env: Env, request: Request) {
  const user = await currentUser(env, request);
  if (!user) throw new Response(JSON.stringify({ detail: 'Sign in required' }), { status: 401 });
  return user;
}
export async function requireAdmin(env: Env, request: Request) {
  const user = await requireUser(env, request);
  if (user.role !== 'admin')
    throw new Response(JSON.stringify({ detail: 'Administrator access required' }), {
      status: 403,
    });
  return user;
}
