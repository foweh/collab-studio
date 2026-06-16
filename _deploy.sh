#!/bin/bash
# CollabStudio 部署脚本 - 通过 Git Bash SSH 自动登录
# 被 node _run_deploy.js 调用

HOST="root@8.213.147.43"
DST="/root/collab-studio/collab-studio"
SRC="/f/duhisjdkc/xiangmu/collab-studio"
PASS="Abdurahman666%"

export SSH_ASKPASS="/f/duhisjdkc/xiangmu/collab-studio/_askpass.sh"
export DISPLAY="none:0"

echo "=== [1/4] 停止旧服务 ==="
/usr/bin/ssh -o StrictHostKeyChecking=no $HOST "pkill -f 'node server.js' 2>/dev/null; sleep 1" </dev/null

echo ""
echo "=== [2/4] 上传文件 ==="
FILES=(
  "$SRC/server.js:$DST/server.js"
  "$SRC/public/app.js:$DST/public/app.js"
  "$SRC/public/index.html:$DST/public/index.html"
  "$SRC/public/style.css:$DST/public/style.css"
  "$SRC/public/mindmap.js:$DST/public/mindmap.js"
  "$SRC/services/auth.js:$DST/services/auth.js"
  "$SRC/services/project.js:$DST/services/project.js"
  "$SRC/services/logger.js:$DST/services/logger.js"
  "$SRC/services/annotation.js:$DST/services/annotation.js"
  "$SRC/utils/persist.js:$DST/utils/persist.js"
  "$SRC/utils/ratelimit.js:$DST/utils/ratelimit.js"
)

for entry in "${FILES[@]}"; do
  src="${entry%%:*}"
  dst="${entry##*:}"
  echo "  上传 $(basename $src)..."
  /usr/bin/scp -o StrictHostKeyChecking=no "$src" "$HOST:$dst" 2>/dev/null
done

echo ""
echo "=== [3/4] 重启服务 ==="
/usr/bin/ssh -o StrictHostKeyChecking=no $HOST "cd $DST && export ADMIN_PASSWORD='$PASS' && nohup node server.js > server.log 2>&1 & sleep 2 && echo '服务已启动'" </dev/null

echo ""
echo "=== [4/4] 验证 ==="
/usr/bin/ssh -o StrictHostKeyChecking=no $HOST "curl -s http://localhost:3000 | head -3" </dev/null

echo ""
echo "=== 完成！ ==="
echo "访问 http://8.213.147.43:3000"
echo "管理员：热合曼  密码：Abdurahman666%"
