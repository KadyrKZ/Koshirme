import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  mkdirSync(root + 'native/bin', { recursive: true });
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-O',
      '-framework',
      'AppKit',
      '-target',
      process.arch + '-apple-macos12.0',
      root + 'native/app-guard.swift',
      '-o',
      root + 'native/bin/koshirme-app-guard',
    ],
    { stdio: 'inherit' },
  );
}
