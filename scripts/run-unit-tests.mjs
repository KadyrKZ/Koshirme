import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Expand test filenames here, instead of depending on PowerShell/cmd shell globs.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guardOnly = process.argv.includes('--guard');
const files = guardOnly
  ? readdirSync(join(root, 'tests'))
      .filter((name) => /^guard-.*\.test\.ts$/.test(name) || name === 'backend-lifecycle.test.ts')
      .map((name) => join('tests', name))
  : [
      ...readdirSync(join(root, 'packages/protocol/tests'))
        .filter((name) => name.endsWith('.test.ts'))
        .map((name) => join('packages/protocol/tests', name)),
      'tests/contest-navigation.test.ts',
      'tests/exam-chrome-policy.test.mjs',
    ];
const result = spawnSync(
  process.execPath,
  [
    ...(guardOnly ? ['--experimental-test-module-mocks'] : []),
    '--import',
    'tsx',
    '--test',
    ...files.sort(),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
