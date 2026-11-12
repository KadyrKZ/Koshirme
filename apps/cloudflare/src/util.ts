import { WAITING_URL } from '@koshirme/protocol';
import type { EventRow, ExamRow, StudentRow, UserRow } from './types';

export const now = () => new Date().toISOString();
export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
export const error = (status: number, detail: string) => json({ detail }, status);
export const bearer = (request: Request) => {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};
export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};
export const randomToken = (bytes = 32) => {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64(data);
};
export async function sha256(value: string) {
  return bytesToBase64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}
export function publicUser(row: UserRow) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, active: !!row.active };
}
export function publicExam(row: ExamRow) {
  let allowedUrls: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.allowed_urls || '[]');
    if (Array.isArray(parsed))
      allowedUrls = parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    // Legacy rows fall back to allowed_url below.
  }
  if (!allowedUrls.length) allowedUrls = [row.allowed_url];
  return { ...row, allowed_urls: allowedUrls, active: !!row.active, paused: !!row.paused };
}
export function studentExam(row: ExamRow) {
  const exam = publicExam(row);
  if (exam.active || row.fizmat_contest_id) return exam;
  return { ...exam, title: 'Контест', allowed_url: WAITING_URL, allowed_urls: [WAITING_URL] };
}
export function publicStudent(row: StudentRow) {
  const { token_hash: _, fizmat_session_hash: _session, ...student } = row;
  return { ...student, connected: !!row.connected, active: !!row.active, ready: !!row.ready };
}
export function publicEvent(row: EventRow) {
  return { ...row, metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown> };
}
export function cleanUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'chrome:', 'about:', 'chrome-extension:'].includes(url.protocol))
      return null;
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json'))
    throw new Response(JSON.stringify({ detail: 'JSON required' }), { status: 415 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Response(JSON.stringify({ detail: 'Object required' }), { status: 422 });
  return body as Record<string, unknown>;
}
