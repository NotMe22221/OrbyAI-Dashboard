$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\.."
$buildDir = Join-Path $root "artifacts\dashboard-build"
$zipPath = Join-Path $root "artifacts\dashboard-build.zip"

if (Test-Path $buildDir) {
  Remove-Item -Recurse -Force $buildDir
}

New-Item -ItemType Directory -Path $buildDir | Out-Null

$dashboard = Join-Path $root "apps\dashboard"
Copy-Item -Recurse -Force (Join-Path $dashboard ".next") (Join-Path $buildDir ".next")
Copy-Item -Force (Join-Path $dashboard "package.json") (Join-Path $buildDir "package.dashboard.json")
Copy-Item -Force (Join-Path $root "package.json") (Join-Path $buildDir "package.root.json")

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

Compress-Archive -Path (Join-Path $buildDir "*") -DestinationPath $zipPath
Write-Output "Created $zipPath"

