@echo off
chcp 65001 >nul
title Collab Studio 一键部署

echo ============================================
echo   🚀 Collab Studio 一键部署工具
echo ============================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ 未找到 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)

:: 安装依赖
echo 📦 检查依赖...
if not exist "node_modules\ssh2" (
    echo  → 安装 ssh2...
    call npm install ssh2 --ignore-scripts
    if %ERRORLEVEL% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖已就绪
)

echo.
echo 🔌 正在部署到 8.213.147.43 ...
echo.

:: 运行部署脚本
node deploy_sync.js

echo.
if %ERRORLEVEL% equ 0 (
    echo ✅ 部署成功完成！
) else (
    echo ❌ 部署过程中出现错误，请检查上方日志
)

echo.
pause
