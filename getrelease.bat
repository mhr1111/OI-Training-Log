@echo off
REM OI Training Log — 一键打包脚本
REM 用 npmmirror 镜像加速国内下载

chcp 65001 >nul
cd /d "%~dp0"

echo [1/2] 清理旧产物...
Remove-Item -Recurse -Force "release" 2>nul

echo [2/2] 设置镜像 + 打包...
REM Electron 本体 + electron-builder 所有依赖二进制（nsis 等）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

call npm run dist

echo.
if errorlevel 1 (
  echo [错误] 打包失败
) else (
  echo [完成] 产出物在 release\ 目录
  dir release\*.exe 2>nul
)
pause
