import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = await import('../package.json', { with: { type: 'json' } });
const version = packageJson.default.version;
const app = join(project, 'release', 'mac-arm64', 'KOSH!RME.app');
const dmg = join(project, 'release', `KOSHIRME-${version}-arm64.dmg`);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  execFileSync(command, args, { cwd: project, stdio: 'inherit' });
}

requireCondition(process.platform === 'darwin', 'Сборку macOS нужно запускать на Mac.');
if (!process.env.CSC_LINK) {
  const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  requireCondition(
    identities.includes('Developer ID Application:'),
    'В Keychain не найден сертификат Developer ID Application. Apple Development для распространения не подходит.',
  );
}

requireCondition(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
    (process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID) ||
    process.env.APPLE_KEYCHAIN_PROFILE,
  'Нужны данные для Apple notarization: APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, либо APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, либо APPLE_KEYCHAIN_PROFILE.',
);

run('npm', ['run', 'build']);
run('npx', ['electron-builder', '--mac', '--arm64', '--publish', 'never']);
requireCondition(existsSync(app) && existsSync(dmg), 'Сборка не создала приложение и DMG.');
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const signatureResult = spawnSync('codesign', ['-dv', '--verbose=4', app], {
  encoding: 'utf8',
});
requireCondition(signatureResult.status === 0, signatureResult.stderr);
const signature = signatureResult.stderr;
requireCondition(
  signature.includes('Authority=Developer ID Application:') &&
    /TeamIdentifier=(?!not set)\S+/.test(signature),
  'Приложение не подписано сертификатом Developer ID Application.',
);
run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
run('xcrun', ['stapler', 'validate', app]);
// The app ticket and the disk-image ticket cover different signed artifacts.
// With the recommended Keychain profile, validate the downloadable image too.
if (process.env.APPLE_KEYCHAIN_PROFILE) {
  run('xcrun', [
    'notarytool', 'submit', dmg,
    '--keychain-profile', process.env.APPLE_KEYCHAIN_PROFILE,
    '--wait',
  ]);
  run('xcrun', ['stapler', 'staple', dmg]);
  run('xcrun', ['stapler', 'validate', dmg]);
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);
}
run('hdiutil', ['verify', dmg]);

const hash = createHash('sha256');
for await (const chunk of createReadStream(dmg)) hash.update(chunk);
console.log(`Готово: ${dmg}\nSHA-256: ${hash.digest('hex')}`);
