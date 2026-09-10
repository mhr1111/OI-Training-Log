# OI Training Log — Cleanup Script
# Removes test / build artifacts. Keeps source code and dependencies.
#
# Usage:
#   .\clean.ps1                    # Build artifacts only (dist, release, dist-server)
#   .\clean.ps1 -WithData          # Also wipes api/data/store.json (ALL synced submissions!)
#   .\clean.ps1 -Cache             # Also wipes Electron / electron-builder system caches
#   .\clean.ps1 -All               # Everything above + system caches
#   .\clean.ps1 -DryRun            # List what WOULD be deleted, no actual deletion

param(
  [switch]$WithData,
  [switch]$Cache,
  [switch]$All,
  [switch]$DryRun
)

if ($All) { $WithData = $true; $Cache = $true }

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$deleted = @()
$skipped = @()

function Remove-Safe {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path $Path)) { $script:skipped += "(missing) $Label"; return }
  if ($DryRun) { $script:deleted += "[DRY] $Label -> $Path"; return }
  try {
    Remove-Item -Recurse -Force $Path -ErrorAction Stop
    $script:deleted += "OK $Label"
  } catch {
    $script:skipped += "FAIL $Label -- $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "=== OI Training Log Cleanup ===" -ForegroundColor Cyan
Write-Host "Root: $root"
if ($DryRun) { Write-Host "Mode: DRY RUN (no actual deletion)" -ForegroundColor Yellow }
Write-Host ""

# ---------- 1. Build artifacts (always) ----------
Write-Host "--- Build artifacts ---" -ForegroundColor White
Remove-Safe (Join-Path $root "dist")             "frontend build dist/"
Remove-Safe (Join-Path $root "dist-server")      "backend bundle dist-server/"
Remove-Safe (Join-Path $root "release")          "electron-builder output release/"
Remove-Safe (Join-Path $root "tmp-probe2.mts")   "temp probe file"
Remove-Safe (Join-Path $root "api\data\store.json.tmp") "store.json temp file"

# ---------- 2. User data (requires -WithData) ----------
if ($WithData) {
  Write-Host ""
  Write-Host "--- WARNING: User data ---" -ForegroundColor Red
  Write-Host "  This deletes api/data/store.json (ALL synced submissions + credentials)" -ForegroundColor Red
  Remove-Safe (Join-Path $root "api\data")        "user data api/data/"
} else {
  $skipped += "(kept) api/data/store.json - pass -WithData to wipe"
}

# ---------- 3. System-level caches (requires -Cache) ----------
if ($Cache) {
  Write-Host ""
  Write-Host "--- System caches ---" -ForegroundColor White
  Remove-Safe "$env:LOCALAPPDATA\electron\Cache"              "Electron binary download cache"
  Remove-Safe "$env:LOCALAPPDATA\electron-builder\Cache"      "electron-builder binary cache (winCodeSign/nsis)"
} else {
  $skipped += "(kept) system caches - pass -Cache to wipe"
}

# ---------- 4. Kill leftover processes ----------
Write-Host ""
Write-Host "--- Leftover processes ---" -ForegroundColor White
$killed = @()
foreach ($name in @("OI-Training-Log", "electron")) {
  $procs = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object {
    # only touch processes spawned from this project
    try { $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }
  }
  foreach ($p in $procs) {
    if ($DryRun) { $killed += "[DRY] kill $($p.ProcessName) PID $($p.Id)" }
    else {
      try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed += "OK kill $($p.ProcessName) PID $($p.Id)" }
      catch { $killed += "FAIL kill $($p.ProcessName) PID $($p.Id) -- $($_.Exception.Message)" }
    }
  }
}
# anything on port 3001
try {
  $conn = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
  foreach ($c in $conn) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -ne "System") {
      if ($DryRun) { $killed += "[DRY] kill port-3001 $($proc.ProcessName) PID $($proc.Id)" }
      else {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop; $killed += "OK kill port-3001 $($proc.ProcessName) PID $($proc.Id)" }
        catch { $killed += "FAIL kill $($proc.ProcessName) -- $($_.Exception.Message)" }
      }
    }
  }
} catch {}

if ($killed.Count -eq 0) { Write-Host "  none" } else { $killed | ForEach-Object { Write-Host "  $_" } }

# ---------- Summary ----------
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($deleted.Count -gt 0) {
  Write-Host "Deleted ($($deleted.Count)):" -ForegroundColor Green
  $deleted | ForEach-Object { Write-Host "  $_" }
}
if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "Skipped ($($skipped.Count)):" -ForegroundColor Gray
  $skipped | ForEach-Object { Write-Host "  $_" }
}
if ($deleted.Count -eq 0 -and $skipped.Count -eq 0) {
  Write-Host "Nothing to clean." -ForegroundColor Gray
}
Write-Host ""
