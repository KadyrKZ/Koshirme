#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const required = [
  'CWS_PUBLISHER_ID',
  'CWS_EXTENSION_ID',
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing Chrome Web Store credentials: ${missing.join(', ')}`);
  process.exit(2);
}

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: publish-webstore.mjs <extension.zip>');
  process.exit(2);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

const token = await request('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.CWS_CLIENT_ID,
    client_secret: process.env.CWS_CLIENT_SECRET,
    refresh_token: process.env.CWS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});

const base = `https://chromewebstore.googleapis.com/v2/publishers/${encodeURIComponent(process.env.CWS_PUBLISHER_ID)}/items/${encodeURIComponent(process.env.CWS_EXTENSION_ID)}`;
const auth = { Authorization: `Bearer ${token.access_token}` };
const archive = await readFile(zipPath);

const upload = await request(`${base}:upload`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/zip' },
  body: archive,
});
console.log(`Uploaded ${zipPath}: ${JSON.stringify(upload)}`);

const publish = await request(`${base}:publish`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: '{}',
});
console.log(`Submitted for publication: ${JSON.stringify(publish)}`);
