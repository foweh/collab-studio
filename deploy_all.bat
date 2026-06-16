@echo off
chcp 65001 >nul

set HOST=root@8.213.147.43
set DST=/root/collab-studio/collab-studio
set SRC=F:\duhisjdkc\xiangmu\collab-studio

echo ========================================
echo  CollabStudio 部署脚本
echo ========================================
echo.
echo 请确保已经 SSH 登录过一次（验证过主机密钥）
echo.

echo [1/4] 停止旧服务...
ssh %HOST% "pkill -f 'node server.js' 2>/dev/null; sleep 1"
echo.

echo [2/4] 上传文件（需要输入密码 2 次）...
echo.
echo = 上传 server.js =
scp "%SRC%\server.js" "%HOST%:%DST%/server.js"
echo.
echo = 上传 public/ =
scp "%SRC%\public\app.js" "%HOST%:%DST%/public/app.js"
scp "%SRC%\public\index.html" "%HOST%:%DST%/public/index.html"
scp "%SRC%\public\style.css" "%HOST%:%DST%/public/style.css"
scp "%SRC%\public\mindmap.js" "%HOST%:%DST%/public/mindmap.js"
scp "%SRC%\services\auth.js" "%HOST%:%DST%/services/auth.js"
scp "%SRC%\services\project.js" "%HOST%:%DST%/services/project.js"
scp "%SRC%\services\logger.js" "%HOST%:%DST%/services/logger.js"
scp "%SRC%\services\annotation.js" "%HOST%:%DST%/services/annotation.js"
scp "%SRC%\utils\persist.js" "%HOST%:%DST%/utils/persist.js"
scp "%SRC%\utils\ratelimit.js" "%HOST%:%DST%/utils/ratelimit.js"
echo.

echo [3/4] 重启服务...
ssh %HOST% "cd /root/collab-studio/collab-studio && export ADMIN_PASSWORD=Abdurahman666%% && nohup node server.js > server.log 2>&1 & sleep 2"
echo.

echo [4/4] 验证...
ssh %HOST% "curl -s http://localhost:3000 | head -3"
echo.

echo ========================================
echo  完成！
echo  访问 http://8.213.147.43:3000
echo.
echo  管理员：热合曼
echo  密码：Abdurahman666%
echo ========================================
pause
