import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Some IDE/tooling shells export this flag. Desktop must run as an app, not as Node.
delete process.env.ELECTRON_RUN_AS_NODE;
const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js');
await import(pathToFileURL(cli).href);
