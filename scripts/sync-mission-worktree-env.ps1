param(
  [switch]$Overwrite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$rootEnvPath = Join-Path $repoRoot ".env"

if (-not (Test-Path $rootEnvPath)) {
  throw "Root .env not found at $rootEnvPath"
}

$targets = @(
  "..\sliderule-0-mission-contracts",
  "..\sliderule-A-mission-core",
  "..\sliderule-B-lobster-executor",
  "..\sliderule-C-brain-dispatch",
  "..\sliderule-D-feishu-mission-bridge",
  "..\sliderule-E-tasks-universe",
  "..\sliderule-F-mission-integration"
)

Push-Location $repoRoot
try {
  foreach ($target in $targets) {
    $resolvedTarget = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $target))
    if (-not (Test-Path $resolvedTarget)) {
      Write-Host "Skipping missing worktree: $resolvedTarget"
      continue
    }

    $targetEnvPath = Join-Path $resolvedTarget ".env"
    if ((Test-Path $targetEnvPath) -and -not $Overwrite) {
      Write-Host "Keeping existing .env in $resolvedTarget"
      continue
    }

    Copy-Item -LiteralPath $rootEnvPath -Destination $targetEnvPath -Force
    Write-Host "Synced .env -> $targetEnvPath"
  }
} finally {
  Pop-Location
}
