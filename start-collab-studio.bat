@echo off
chcp 65001 >nul
title CollabStudio 创作工作室

cd /d "%~dp0"

rem :: Check and kill process on port 3000 ::
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
  if not "%%a"=="" (
    taskkill /f /pid %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
  )
)

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║     🎬  CollabStudio 创作工作室            ║
echo   ║     多机协作 · 剧本 · 导图 · 音乐 · 场景   ║
echo   ╠══════════════════════════════════════════╣
echo   ║  启动中...                                ║
echo   ║                                          ║
echo   ║  📜 剧本编辑器    🧠 思维导图              ║
echo   ║  🎵 音乐工作台    🎞️ 场景检测              ║
echo   ║  💬 群聊 & 私聊                            ║
echo   ╚══════════════════════════════════════════╝
echo.
echo   浏览器将自动打开，请稍候...
echo   按 Ctrl+C 可停止服务器
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

node server.js

pause

