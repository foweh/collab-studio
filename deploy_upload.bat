@echo off
chcp 65001 >nul
setlocal

REM ============================================
REM CollabStudio - 逐个文件上传 + 重启
REM (备选方案: 如果 _update.sh 太大传输慢，用这个)
REM ============================================

set HOST=root@8.213.147.43
set DST=/root/collab-studio/collab-studio

echo ========================================
echo  CollabStudio 文件上传
echo ========================================
echo.

echo [1/3] 停止旧服务...
ssh -o StrictHostKeyChecking=no %HOST% "pkill -f 'node server.js' 2>/dev/null; sleep 1" 2>nul
echo.

echo [2/3] 上传文件...

for %%F in (
    "server.js"
    "package.json"
    "public\index.html"
    "public\login.html"
    "public\style.css"
    "public\app.js"
    "public\shared.js"
    "public\i18n.js"
    "public\script-editor.js"
    "public\mindmap.js"
    "public\story-editor.js"
    "public\devices.js"
    "public\default-avatar.png"
    "public\fenjing\index.html"
    "public\fenjing\assets\index-DSxpk27Y.js"
    "public\fenjing\assets\index-XptjBxIK.css"
    "services\auth.js"
    "services\project.js"
    "services\logger.js"
    "services\annotation.js"
    "utils\persist.js"
    "utils\ratelimit.js"
) do (
    set "f=%%~F"
    call :upload "%%~f"
)
echo.
echo [3/3] 启动服务...
ssh %HOST% "cd %DST% && export ADMIN_PASSWORD=Abdurahman666%% && nohup node server.js > server.log 2>&1 & sleep 2 && curl -s http://localhost:3000 | head -3"

echo.
echo ========================================
echo  访问 http://8.213.147.43:3000
echo  管理员：热合曼  密码：Abdurahman666%%
echo ========================================
pause
exit /b 0

:upload
set "filepath=%~1"
set "filename=%~nx1"
set "remote=%DST%/%~1"

REM 确保远程目录存在
for %%d in ("%remote%\..") do (
    ssh %HOST% "mkdir -p %%~d" 2>nul
)

echo   上传 %filepath% ...
scp -q "%~dp0%filepath%" "%HOST%:%remote%"
if %ERRORLEVEL% EQU 0 (
    echo     OK
) else (
    echo     FAILED
)
exit /b 0
