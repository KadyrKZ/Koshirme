import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const generator = fileURLToPath(
  new URL('../scripts/prepare-exam-chrome-policy.mjs', import.meta.url),
);
test('single-account policies preserve a literal email across Windows, Mac and Linux', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'koshirme-policy-'));
  try {
    const output = resolve(directory, 'generated');
    const result = spawnSync(
      process.execPath,
      [generator, '--email', 'Student.Test+exam@School.kz', '--out', output],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const linux = JSON.parse(readFileSync(resolve(output, 'koshirme-chrome.json'), 'utf8'));
    assert.equal(linux.BrowserSignin, 2);
    const pattern = linux.RestrictSigninToPattern;
    assert.equal(pattern, '^student\\.test\\+exam@school\\.kz$');
    const allowed = new RegExp(pattern);
    assert.equal(allowed.test('student.test+exam@school.kz'), true);
    for (const email of [
      'studentXtest+exam@school.kz',
      'student.testexam@school.kz',
      'other@school.kz',
      'student.test+exam@schoolXkz',
      'student.test+exam@school.kz.evil',
    ])
      assert.equal(allowed.test(email), false, email);
    assert.deepEqual(linux.ExtensionInstallForcelist, [
      'mcfibeppldfkaahnjdpbcfpbncemolnp;https://clients2.google.com/service/update2/crx',
    ]);

    const winBytes = readFileSync(resolve(output, 'koshirme-chrome.reg'));
    assert.equal(winBytes.readUInt16LE(0), 0xfeff);
    const windows = winBytes.toString('utf16le');
    assert.ok(windows.includes('"BrowserSignin"=dword:00000002\r\n'));
    const registryPattern = windows.match(/^"RestrictSigninToPattern"=(.+)\r$/m)?.[1];
    assert.equal(JSON.parse(registryPattern), pattern);
    const mac = readFileSync(resolve(output, 'KOSH!RME-Chrome.mobileconfig'), 'utf8');
    assert.match(mac, /<key>BrowserSignin<\/key>\s*<integer>2<\/integer>/);
    assert.equal(
      mac.match(/<key>RestrictSigninToPattern<\/key>\s*<string>(.*?)<\/string>/s)?.[1],
      pattern,
    );
    // Accidentally targeting the same output must never replace an existing deployment.
    writeFileSync(resolve(output, 'README.txt'), 'operator data');
    const retry = spawnSync(process.execPath, [
      generator,
      '--email',
      'other@school.kz',
      '--out',
      output,
    ]);
    assert.notEqual(retry.status, 0);
    assert.equal(readFileSync(resolve(output, 'README.txt'), 'utf8'), 'operator data');
    assert.equal(
      JSON.parse(readFileSync(resolve(output, 'koshirme-chrome.json'), 'utf8'))
        .RestrictSigninToPattern,
      pattern,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects domain patterns and injected policy content', () => {
  for (const email of [
    '^.*@school.kz$',
    'student@school.kz\n"BrowserSignin"=0',
    'student@school..kz',
    'student"@school.kz',
    '--email',
  ]) {
    const result = spawnSync(process.execPath, [
      generator,
      '--email',
      email,
      '--out',
      'must-not-be-created',
    ]);
    assert.notEqual(result.status, 0);
  }
});
