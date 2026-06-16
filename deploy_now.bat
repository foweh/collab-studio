@echo off
chcp 65001 >nul
setlocal

REM ============================================
REM CollabStudio 阿里云一键部署 (当前目录)
REM 双击运行 或 CMD 中运行即可
REM ============================================

set HOST=root@8.213.147.43
set DST=/root/collab-studio/collab-studio

echo ========================================
echo  CollabStudio 阿里云部署
echo ========================================
echo.
echo 服务器: 8.213.147.43
echo 项目目录: %~dp0
echo.
echo 请确保已经生成 _update.sh (运行: node _gen_update.js)
echo.

if not exist "%~dp0_update.sh" (
    echo [错误] 找不到 _update.sh，请先运行: node _gen_update.js
    pause
    exit /b 1
)

echo [1/3] 上传部署脚本 (需要输入密码)...
scp "%~dp0_update.sh" "%HOST%:%DST%/_update.sh"
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 上传失败，请检查网络和密码
    pause
    exit /b 1
)

echo.
echo [2/3] 在服务器上执行部署 (需要再次输入密码)...
ssh %HOST% "cd %DST% && bash _update.sh"
if %ERRORLEVEL% NEQ 0 (
    echo [警告] 远程执行可能有问题，请检查
)

echo.
echo [3/3] 验证服务...
ssh %HOST% "curl -s http://localhost:3000 | head -3"

echo.
echo ========================================
echo  完成！
echo  访问: http://8.213.147.43:3000
echo  管理员: 热合曼
echo  密码: Abdurahman666%%
echo ========================================
pause
