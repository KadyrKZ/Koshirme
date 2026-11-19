import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const framework = join(
    process.env.SystemRoot || 'C:\\Windows',
    'Microsoft.NET',
    'Framework64',
    'v4.0.30319',
  );
  const compiler = join(framework, 'csc.exe');
  if (!existsSync(compiler))
    throw new Error('The Windows .NET Framework 4.x C# compiler is required.');
  const output = join(project, 'native', 'bin');
  mkdirSync(output, { recursive: true });
  execFileSync(
    compiler,
    [
      '/nologo',
      '/target:exe',
      '/platform:x64',
      '/optimize+',
      '/warnaserror+',
      '/reference:' + join(framework, 'System.Web.Extensions.dll'),
      '/out:' + join(output, 'koshirme-app-guard.exe'),
      join(project, 'native', 'windows-app-guard.cs'),
    ],
    { stdio: 'inherit' },
  );
}
