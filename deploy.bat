@echo off
REM ============================================
REM CollabStudio 阿里云一键部署脚本
REM 在你本机 Windows 上双击运行 或 在CMD中运行
REM ============================================

set HOST=8.213.147.43
set USER=root
set PASSWORD=Abdurahman666%

echo.
echo [1/4] 安装 Node.js 18...
plink -pw "%PASSWORD%" -no-antispoof %USER%@%HOST% "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt update && sudo apt install -y nodejs git"

echo.
echo [2/4] 验证 Node.js...
plink -pw "%PASSWORD%" -no-antispoof %USER%@%HOST% "node -v && npm -v"

echo.
echo [3/4] 克隆项目 + 安装依赖...
plink -pw "%PASSWORD%" -no-antispoof %USER%@%HOST% "cd /root && git clone https://github.com/foweh/collab-studio.git && cd collab-studio && npm install"

echo.
echo [4/4] 设置管理员密码 + 启动服务...
plink -pw "%PASSWORD%" -no-antispoof %USER%@%HOST% "cd /root/collab-studio && export ADMIN_PASSWORD=Abdurahman666%% && nohup node server.js > server.log 2>&1 &"

echo.
echo ============================================
echo 部署完成！访问 http://%HOST%:3000
echo 管理员：热合曼  密码：Abdurahman666%
echo ============================================
pause
