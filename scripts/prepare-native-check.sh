#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
[[ $(uname -s) == Darwin ]] || { echo 'Run on macOS'; exit 1; }
node --version
npm ci
npm test
npm run build --workspace @koshirme/student-desktop
node --input-type=module - <<'JS'
for (const url of ['https://fizmat.win/api/health','https://koshirme.stream/api/health']) {
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!r.ok || !(await r.json()).ok) throw Error('Health check failed: '+url);
 console.log('OK '+url);
}
JS
echo 'Preparation passed. Read docs/codex/MACOS.md; physical tests are still required.'
