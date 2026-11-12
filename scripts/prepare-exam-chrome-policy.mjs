import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates files for an operator to deploy; never changes local Chrome policies.
const templates = resolve(dirname(fileURLToPath(import.meta.url)), '../enterprise-policy');
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--email' || args[2] !== '--out') {
  console.error(
    'Usage: node scripts/prepare-exam-chrome-policy.mjs --email student@school.kz --out /path/to/new-folder',
  );
  process.exit(1);
}
const email = args[1].toLowerCase();
if (
  email.length > 254 ||
  !/^[a-z0-9][a-z0-9._+%-]*@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(email) ||
  email.includes('..')
) {
  console.error(
    'Enter one valid Google account email address, not a domain or a regular expression.',
  );
  process.exit(1);
}
const pattern = `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
const output = resolve(args[3]);
// Refuse to overwrite an existing directory, including the source templates.
mkdirSync(output, { recursive: false });
const linux = JSON.parse(readFileSync(resolve(templates, 'linux/koshirme-chrome.json'), 'utf8'));
linux.BrowserSignin = 2;
linux.RestrictSigninToPattern = pattern;
writeFileSync(resolve(output, 'koshirme-chrome.json'), `${JSON.stringify(linux, null, 2)}\n`);

let windows = readFileSync(resolve(templates, 'windows/koshirme-chrome.reg'), 'utf8');
windows = windows.replace(
  '[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]',
  `[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]\n"BrowserSignin"=dword:00000002\n"RestrictSigninToPattern"=${JSON.stringify(pattern)}`,
);
// Windows Registry Editor expects UTF-16LE with BOM for Unicode .reg files.
writeFileSync(
  resolve(output, 'koshirme-chrome.reg'),
  Buffer.from(`\ufeff${windows.replace(/\r?\n/g, '\r\n')}`, 'utf16le'),
);

const xml = pattern.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let mac = readFileSync(resolve(templates, 'macos/KOSH!RME-Chrome.mobileconfig'), 'utf8');
mac = mac.replace(
  '      <key>GenAiDefaultSettings</key>',
  `      <key>BrowserSignin</key>\n      <integer>2</integer>\n      <key>RestrictSigninToPattern</key>\n      <string>${xml}</string>\n\n      <key>GenAiDefaultSettings</key>`,
);
writeFileSync(resolve(output, 'KOSH!RME-Chrome.mobileconfig'), mac);
writeFileSync(
  resolve(output, 'README.txt'),
  `KOSH!RME: managed exam computer\nAllowed primary Google account: ${email}\n\nProvision a dedicated non-admin OS account with ONE Chrome profile already signed in to this Google account before deployment. Deploy with GPO/Intune on Windows or MDM on macOS, then fully restart Chrome. Verify BrowserSignin=2 and RestrictSigninToPattern=${pattern} in chrome://policy (Status: OK).\n\nThese are machine policies, not settings limited to one Chrome profile. Other primary Google accounts are not allowed. Profiles using the same allowed account are not distinguished by this policy: keep exactly one provisioned profile. Policies do not restrict other browsers or OS applications. Initial Google sign-in requires internet.\n\nRollback: your administrator should restore the previous managed policy configuration, not delete Chrome profiles or user data. See enterprise-policy/README.md in the source package.\n`,
);
console.log(`Prepared policies for ${email}: ${output}`);
