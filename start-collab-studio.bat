@echo off
chcp 65001 >nul
title 🎬 Collab Studio - 协作工作室

echo.
echo   🎬  Collab Studio 协作工作室 启动中...
echo   ─────────────────────────────────
echo   浏览器将自动打开，请稍候...
echo   按 Ctrl+C 可停止服务器
echo.

:: 切到脚本所在目录（保证双击桌面快捷方式也能正确运行）
cd /d "%~dp0"

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ 未找到 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)

:: 等 2 秒让服务器先起来，再开浏览器
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/"

node server.js
pause
