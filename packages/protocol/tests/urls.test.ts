import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedUrl, normalizeAllowedUrl, sanitizeUrl } from '../src/index.js';
test('allowed path respects origin and path boundaries', () => {
  const allowed = 'https://contest.yandex.ru/contest/12345/';
  assert.ok(isAllowedUrl(`${allowed}problems/A/?x=1`, allowed));
  assert.ok(isAllowedUrl('https://contest.yandex.ru/contest/12345', allowed));
  for (const value of [
    'https://contest.yandex.ru.evil.test/contest/12345/',
    'https://contest.yandex.ru/contest/123456/',
    'http://contest.yandex.ru/contest/12345/',
    'chrome://newtab/',
    undefined,
  ]) {
    assert.equal(isAllowedUrl(value, allowed), false);
  }
  assert.ok(isAllowedUrl('https://contest.yandex.ru/contest/1/', 'https://contest.yandex.ru/'));
});
test('never log credentials, query parameters or fragments', () => {
  assert.equal(
    sanitizeUrl('https://alice:secret@example.org/path?token=secret#private'),
    'https://example.org/path',
  );
});
test('multiple allowed contest pages are accepted without widening paths', () => {
  const allowed = [
    'https://contest.yandex.ru/contest/100/',
    'https://contest.yandex.ru/contest/200/',
    'https://contest.yandex.ru/contest/300/',
  ];
  assert.ok(isAllowedUrl('https://contest.yandex.ru/contest/200/problems/A/', allowed));
  assert.equal(isAllowedUrl('https://contest.yandex.ru/contest/400/', allowed), false);
});
test('teacher-provided HTTPS pages are allowed with their child paths', () => {
  const allowed = [
    'https://contest.yandex.ru/contest/',
    'https://www.programiz.com/cpp-programming/online-compiler/',
  ];
  assert.ok(isAllowedUrl('https://www.programiz.com/cpp-programming/online-compiler/', allowed));
  assert.ok(
    isAllowedUrl('https://www.programiz.com/cpp-programming/online-compiler/help/', allowed),
  );
  assert.equal(
    isAllowedUrl('https://www.programiz.com/python-programming/online-compiler/', allowed),
    false,
  );
});

test('all contest fields accept arbitrary HTTPS URLs and reject unsafe input', () => {
  assert.equal(
    normalizeAllowedUrl(' https://FIZMAT.win:443/contest/42/?token=secret#private '),
    'https://fizmat.win/contest/42/',
  );
  for (const value of [
    undefined,
    12345,
    '12345',
    'http://example.org/',
    'https:///example.org/',
    'https://alice:secret@example.org/',
    'https://example.org:8443/',
    'https://example.org/' + 'a'.repeat(2048),
  ]) {
    assert.equal(normalizeAllowedUrl(value), null);
  }
});
