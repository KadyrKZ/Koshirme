$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if ($env:OS -ne "Windows_NT") { throw "Run on Windows" }
node --version
if ($LASTEXITCODE -ne 0) { throw "Install Node.js >=22.12 with npm" }
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
npm run build --workspace @koshirme/student-desktop
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed" }
foreach ($url in @("https://fizmat.win/api/health", "https://koshirme.stream/api/health")) {
  $health = Invoke-RestMethod -Uri $url -TimeoutSec 20
  if (-not $health.ok) { throw "Server health failed: $url" }
  Write-Host "OK $url"
}
Write-Host "Preparation passed. Read docs/codex/WINDOWS.md; physical tests are still required."
