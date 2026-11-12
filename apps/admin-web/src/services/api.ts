export const embedded = import.meta.env.BASE_URL === '/koshirme/';
export const API_URL = (
  (embedded ? globalThis.location.origin + '/koshirme' : '') ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? globalThis.location.origin : 'http://localhost:8000')
).replace(/\/$/, '');
const tokenKey = embedded ? 'fizmat.koshirme.teacher' : 'examguard.teacher';
let teacherToken = sessionStorage.getItem(tokenKey) || '';
export function getToken() {
  return teacherToken;
}
export function setToken(token: string) {
  teacherToken = token;
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data: { detail?: unknown } = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function screenshotUrl(filename: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/screenshots/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Screenshot could not be loaded');
  return URL.createObjectURL(await response.blob());
}
