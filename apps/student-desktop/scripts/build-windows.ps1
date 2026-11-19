[CmdletBinding()]
param([switch]$UnsignedTestBuild)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $ProjectRoot

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js LTS x64 (24 recommended, minimum 22.12) from https://nodejs.org/'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'npm.cmd was not found. Reinstall Node.js with npm and Add to PATH enabled.'
}

& node.exe (Join-Path $PSScriptRoot 'check-windows-node.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Unsupported Node.js version, architecture or platform.' }

function Invoke-Npm {
  param([string[]]$NpmArguments)
  & npm.cmd @NpmArguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd $($NpmArguments -join ' ') failed with exit code $LASTEXITCODE. Build stopped."
  }
}

$SigningOptions = @()
$InstallerSuffix = 'x64'
if ($UnsignedTestBuild) {
  $SigningOptions = @('--', '--config.win.forceCodeSigning=false', '--config.win.signExecutable=false', '--config.artifactName=KOSHIRME-${version}-x64-TEST.${ext}')
  $InstallerSuffix = 'x64-TEST'
} elseif ($env:KOSHIRME_WINDOWS_CERT_SHA1) {
  if ($env:KOSHIRME_WINDOWS_CERT_SHA1 -notmatch '^[0-9a-fA-F]{40}$') { throw 'Invalid signing certificate thumbprint.' }
  $SigningOptions = @('--', "--config.win.signtoolOptions.certificateSha1=$($env:KOSHIRME_WINDOWS_CERT_SHA1)")
} elseif (-not $env:WIN_CSC_LINK) {
  throw 'Configure a trusted Windows signing certificate or pass -UnsignedTestBuild for local testing.'
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Invoke-Npm -NpmArguments @('ci')
Invoke-Npm -NpmArguments @('run', 'typecheck')
Invoke-Npm -NpmArguments @('test')
Invoke-Npm -NpmArguments @('run', 'build', '--workspace', '@koshirme/chrome-extension')
Invoke-Npm -NpmArguments (@('run', 'dist:win', '--workspace', '@koshirme/student-desktop') + $SigningOptions)

$Desktop = Get-Content (Join-Path $ProjectRoot 'apps/student-desktop/package.json') -Raw | ConvertFrom-Json
$Extension = Get-Content (Join-Path $ProjectRoot 'apps/chrome-extension/dist/manifest.json') -Raw | ConvertFrom-Json
$ReleaseDirectory = Join-Path $ProjectRoot 'apps/student-desktop/release'
$Installer = Join-Path $ReleaseDirectory "KOSHIRME-$($Desktop.version)-$InstallerSuffix.exe"
$ExtensionArchive = Join-Path $ReleaseDirectory "koshirme-chrome-extension-$($Extension.version).zip"
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw "Expected installer was not created: $Installer"
}

if (-not $UnsignedTestBuild) {
  $AppDirectory = Join-Path $ReleaseDirectory 'win-unpacked'
  $Binaries = @($Installer) + @(Get-ChildItem -LiteralPath $AppDirectory -Recurse -File |
    Where-Object { $_.Extension -in '.exe', '.dll' } | Select-Object -ExpandProperty FullName)
  foreach ($Required in @('KOSH!RME.exe', 'resources/koshirme-app-guard.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $AppDirectory $Required) -PathType Leaf)) {
      throw "Required signed application binary missing: $Required"
    }
  }
  foreach ($Binary in $Binaries) {
    $Signature = Get-AuthenticodeSignature -LiteralPath $Binary
    if ($Signature.Status -ne 'Valid') {
      throw "Invalid Authenticode signature for ${Binary}: $($Signature.Status) $($Signature.StatusMessage)"
    }
  }
}
Compress-Archive -Path (Join-Path $ProjectRoot 'apps/chrome-extension/dist/*') -DestinationPath $ExtensionArchive -Force
foreach ($Artifact in @($Installer, $ExtensionArchive)) {
  $Hash = (Get-FileHash -LiteralPath $Artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  "$Hash  $([IO.Path]::GetFileName($Artifact))" | Set-Content -LiteralPath "$Artifact.sha256" -Encoding ASCII
  Write-Host "Artifact: $Artifact" -ForegroundColor Green
  Write-Host "SHA256: $Hash" -ForegroundColor Green
}
Write-Host 'Build finished. Test the installer on Windows before distributing it.' -ForegroundColor Green
Write-Host 'Automatic Fizmat connection requires Desktop 0.1.6 and Chrome extension 0.3.0 or newer.'
