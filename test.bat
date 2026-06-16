@echo off
chcp 65001 >nul
title 🎬 协作工作室 - 本机双实例测试

echo ╔══════════════════════════════════════════╗
echo ║     🧪 本机双实例协作测试                ║
echo ║                                          ║
echo ║  启动两个服务器实例，模拟两台电脑协作    ║
echo ║                                          ║
echo ║  浏览器1 → http://localhost:3000   (A)   ║
echo ║  浏览器2 → http://localhost:3001   (B)   ║
echo ╚══════════════════════════════════════════╝
echo.

:: 获取本脚本所在目录
set DIR=%~dp0
cd /d "%DIR%"

:: 安装依赖（如果还没装）
if not exist "node_modules\" (
  echo 📦 安装依赖...
  call npm install
)

:: 清理旧的后台 node 进程（只杀本项目的 server.js）
echo 🧹 清理旧的服务进程...
taskkill /f /fi "WINDOWTITLE eq Server A" 2>nul
taskkill /f /fi "WINDOWTITLE eq Server B" 2>nul
timeout /t 1 /nobreak >nul

:: 启动 Server A（端口 3000）
echo 🟢 启动 Server A (端口 3000)...
start "Server A" cmd /c "node server.js & pause"

:: 等 3 秒让 A 先起来
echo ⏳ 等待 Server A 启动...
timeout /t 3 /nobreak >nul

:: 启动 Server B（端口 3001，自动加入 A）
echo 🟢 启动 Server B (端口 3001，加入 localhost:3000)...
start "Server B" cmd /c "node server.js --port 3001 --join localhost:3000 & pause"

:: 等 2 秒让桥接建立
timeout /t 2 /nobreak >nul

:: 打开两个浏览器
echo 🌐 打开浏览器...
start "" "http://localhost:3000"
timeout /t 1 /nobreak >nul
start "" "http://localhost:3001"

echo.
echo ✅ 测试环境已启动！
echo   在浏览器中分别输入名字，然后开启局域网
echo   它们会自动发现对方（通过 --join 桥接）
echo.
echo ⚠️  关闭所有窗口即可停止测试
echo.
pause
