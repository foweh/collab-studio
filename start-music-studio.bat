@echo off
chcp 65001 >nul
title 音乐工作台
cd /d "%~dp0"

echo.
echo   🎵  剪辑师音乐工作台 启动中...
echo   ─────────────────────────────────
echo   浏览器将自动打开，请稍候...
echo   按 Ctrl+C 可停止服务器
echo.

:: 等 2 秒让服务器先起来
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/music-studio.html"

node server.js
pause
