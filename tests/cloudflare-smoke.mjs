import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.KOSHIRME_URL;
const email = process.env.KOSHIRME_ADMIN_EMAIL;
const password = process.env.KOSHIRME_ADMIN_PASSWORD;
assert(base && email && password, 'Cloud URL and admin credentials are required');

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000), ...init });
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.arrayBuffer();
  if (!response.ok)
    throw new Error(`${init.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

function openSocket(path, auth) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace(/^http/, 'ws')}${path}`);
    const timer = setTimeout(() => reject(new Error(`WebSocket timeout: ${path}`)), 10_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(auth)));
    socket.addEventListener(
      'message',
      (message) => {
        clearTimeout(timer);
        resolve({ socket, first: JSON.parse(message.data) });
      },
      { once: true },
    );
    socket.addEventListener('error', reject, { once: true });
  });
}

const health = await request('/api/health');
assert.equal(health.body.status, 'ok');
const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const teacherHeaders = {
  authorization: `Bearer ${login.body.token}`,
  'content-type': 'application/json',
};
await request('/api/auth/password', {
  method: 'POST',
  headers: teacherHeaders,
  body: JSON.stringify({ current_password: password, new_password: password }),
});
const exam = (
  await request('/api/exams', {
    method: 'POST',
    headers: teacherHeaders,
    body: JSON.stringify({
      title: `Cloud smoke ${new Date().toISOString()}`,
      allowed_url: 'https://fizmat.win/contest/test/',
    }),
  })
).body;
assert.match(exam.join_code, /^\d{4}$/);
const joined = (
  await request('/api/student/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ student_name: 'Cloud Smoke Student', join_code: exam.join_code }),
  })
).body;
// The waiting page must retain its assigned path after HTTP redirects so readiness can confirm focus.
assert.equal(joined.exam.allowed_url, 'https://fizmat.win/waiting');
const waiting = await fetch(joined.exam.allowed_url);
assert.equal(waiting.status, 200);
assert.equal(new URL(waiting.url).pathname, new URL(joined.exam.allowed_url).pathname);
assert(!joined.exam.allowed_urls.some((url) => url.includes('contest/test')));
const studentHeaders = {
  authorization: `Bearer ${joined.token}`,
  'content-type': 'application/json',
};
const admin = await openSocket(`/ws/admin/${exam.id}`, { type: 'auth', token: login.body.token });
const extension = await openSocket(`/ws/student/${joined.session.id}`, {
  type: 'auth',
  token: joined.token,
  role: 'extension',
});
const desktop = await openSocket(`/ws/student/${joined.session.id}`, {
  type: 'auth',
  token: joined.token,
  role: 'desktop',
});
assert.equal(admin.first.type, 'snapshot');
assert.equal(extension.first.type, 'heartbeat_ack');
assert.equal(desktop.first.type, 'heartbeat_ack');
await request(`/api/student/sessions/${joined.session.id}/ready`, {
  method: 'POST',
  headers: studentHeaders,
});
await request(`/api/exams/${exam.id}/start`, { method: 'POST', headers: teacherHeaders });
const event = (
  await request('/api/events', {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify({
      id: randomUUID(),
      student_session_id: joined.session.id,
      event_type: 'TAB_CHANGED',
      severity: 'high',
      timestamp: new Date().toISOString(),
      current_url: 'https://example.org/private?q=removed',
      metadata: { source: 'cloud_smoke' },
    }),
  })
).body;
assert.equal(event.current_url, 'https://example.org/private');
const jpeg = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',
    'base64',
  ),
);
const form = new FormData();
form.set('file', new Blob([jpeg], { type: 'image/jpeg' }), 'screen.jpg');
const uploaded = await request(`/api/events/${event.id}/screenshot`, {
  method: 'POST',
  headers: { authorization: `Bearer ${joined.token}` },
  body: form,
});
assert.match(uploaded.body.screenshot_path, /^[0-9a-f-]+\.jpg$/);
const image = await request(`/api/screenshots/${uploaded.body.screenshot_path}`, {
  headers: { authorization: `Bearer ${login.body.token}` },
});
assert.equal(image.response.headers.get('content-type'), 'image/jpeg');
await request(`/api/exams/${exam.id}/finish`, { method: 'POST', headers: teacherHeaders });
for (const connection of [admin, extension, desktop]) connection.socket.close();
console.log(
  JSON.stringify({
    health: true,
    login: true,
    room: true,
    webSocket: true,
    event: true,
    screenshot: true,
  }),
);
