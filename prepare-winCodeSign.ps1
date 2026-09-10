# 手动准备 winCodeSign 缓存，避免 electron-builder 在 Windows 上反复踩坑
# （GitHub 超时 + darwin symlink 权限）
#
# 用法：PowerShell 运行（不用管理员权限）
#   powershell -ExecutionPolicy Bypass -File prepare-winCodeSign.ps1

$ErrorActionPreference = 'Stop'

$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$targetDir = Join-Path $cacheDir "2.6.0"
$zipPath = Join-Path $env:TEMP "winCodeSign-2.6.0.7z"

Write-Host "== OI Training Log — 准备 winCodeSign 缓存 ==" -ForegroundColor Cyan
Write-Host "缓存目录: $cacheDir"
Write-Host ""

# 如果已经有了就跳过
if (Test-Path $targetDir) {
  Write-Host "[skip] $targetDir 已存在，无需重复准备" -ForegroundColor Yellow
  Write-Host "打包时 electron-builder 会直接命中这个缓存。"
  exit 0
}

# 1. 清理之前失败的残留
if (Test-Path $cacheDir) {
  Remove-Item -Recurse -Force $cacheDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

# 2. 下载（npmmirror 镜像，国内快）
$url = "https://npmmirror.com/mirrors/electron-builder-binaries/winCodeSign-2.6.0.7z"
Write-Host "[1/3] 下载 winCodeSign-2.6.0.7z ..." -ForegroundColor Green
try {
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  Write-Host "      下载完成：$zipPath"
} catch {
  Write-Host "      镜像下载失败，尝试 GitHub 直连 ..." -ForegroundColor Yellow
  $url2 = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
  Invoke-WebRequest -Uri $url2 -OutFile $zipPath -UseBasicParsing
}

# 3. 解压（用 7zip-bin，项目依赖里已经有了）
Write-Host "[2/3] 解压到 $targetDir ..." -ForegroundColor Green
$sevenZip = Join-Path $PSScriptRoot "node_modules\7zip-bin\win\x64\7za.exe"
if (-not (Test-Path $sevenZip)) {
  $sevenZip = "7z"  # 试试系统里有没有
}

# 关键：不用 -snld 参数，这样 symlink 会被 7-Zip 跳过而不是报错
& $sevenZip x -bd $zipPath "-o$targetDir"

# 4. 删掉 darwin 目录（里面是 macOS 的 symlink，Windows 打包根本不用）
Write-Host "[3/3] 清理 darwin symlink ..." -ForegroundColor Green
$darwinDir = Join-Path $targetDir "darwin"
if (Test-Path $darwinDir) {
  Remove-Item -Recurse -Force $darwinDir -ErrorAction SilentlyContinue
  Write-Host "      已删除 darwin 目录（macOS 符号链接，Windows 打包不需要）"
}

# 5. 清理临时 zip
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "== 完成 ==" -ForegroundColor Cyan
Write-Host "缓存已准备好，现在可以安全打包了："
Write-Host "  npm run dist"
