import bcrypt from 'bcryptjs';
import type { Env, UserRow } from './types';
import { now, sha256 } from './util';
export interface FizmatUser {
  id: string;
  login: string;
  name: string;
  email: string | null;
  role: 'admin' | 'teacher' | 'student';
  active: number;
  password_hash: string;
}
export async function fizmatUser(env: Env, id: string) {
  if (!env.FIZMAT_DB) return null;
  return env.FIZMAT_DB.prepare(
    'SELECT id,login,name,email,role,active,password_hash FROM users WHERE id=?',
  )
    .bind(id)
    .first<FizmatUser>();
}
export async function sharedLogin(env: Env, identifier: string, password: string) {
  if (!env.FIZMAT_DB) return { found: false, user: null };
  const user = await env.FIZMAT_DB.prepare(
    "SELECT id,login,name,email,role,active,password_hash FROM users WHERE (CASE WHEN instr(?, '@')>0 THEN lower(trim(email))=? ELSE lower(login)=? END)",
  )
    .bind(identifier, identifier, identifier)
    .first<FizmatUser>();
  if (!user) return { found: false, user: null };
  if (
    !user.active ||
    user.role === 'student' ||
    !(await bcrypt.compare(password, user.password_hash))
  )
    return { found: true, user: null };
  return { found: true, user: await provision(env, user) };
}
export async function provision(env: Env, source: FizmatUser): Promise<UserRow> {
  if (!source.active || source.role === 'student')
    throw new Response(JSON.stringify({ detail: 'Teacher or administrator account required' }), {
      status: 403,
    });
  const known = await env.DB.prepare('SELECT * FROM users WHERE fizmat_user_id=? OR id=?')
    .bind(source.id, source.id)
    .first<UserRow>();
  if (!known) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO users(id,email,name,password_hash,role,active,created_at,fizmat_user_id) VALUES(?,?,?,?,?,1,?,?)',
    )
      .bind(
        source.id,
        `${source.id}@accounts.fizmat.win`,
        source.name,
        '',
        source.role,
        now(),
        source.id,
      )
      .run();
  }
  await env.DB.prepare('UPDATE users SET name=?,role=?,active=1,fizmat_user_id=? WHERE id=?')
    .bind(source.name, source.role, source.id, known?.id || source.id)
    .run();
  return (await env.DB.prepare('SELECT * FROM users WHERE fizmat_user_id=?')
    .bind(source.id)
    .first<UserRow>())!;
}
export async function credentialVersion(env: Env, user: UserRow) {
  const source = user.fizmat_user_id ? await fizmatUser(env, user.fizmat_user_id) : null;
  return source ? sha256(source.password_hash) : null;
}
export async function refreshSharedUser(env: Env, user: UserRow, version: string | null) {
  if (!user.fizmat_user_id) return user;
  const source = await fizmatUser(env, user.fizmat_user_id);
  if (
    !source?.active ||
    source.role === 'student' ||
    !version ||
    (await sha256(source.password_hash)) !== version
  )
    return null;
  return { ...user, name: source.name, role: source.role };
}
