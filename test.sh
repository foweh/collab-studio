#!/bin/bash
# 🧪 本机双实例协作测试
# 启动两个服务器实例，模拟两台电脑协作
# 浏览器1 → http://localhost:3000   (A)
# 浏览器2 → http://localhost:3001   (B)

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 安装依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

cleanup() {
  echo ""
  echo "🛑 停止所有服务器..."
  kill $PID_A $PID_B 2>/dev/null || true
  wait $PID_A $PID_B 2>/dev/null || true
  echo "✅ 已停止"
}
trap cleanup EXIT INT TERM

# 启动 Server A
echo "🟢 启动 Server A (端口 3000)..."
node server.js &
PID_A=$!

sleep 3

# 启动 Server B
echo "🟢 启动 Server B (端口 3001，加入 localhost:3000)..."
node server.js --port 3001 --join localhost:3000 &
PID_B=$!

sleep 3

# 打开浏览器
echo "🌐 打开浏览器..."
if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3000" &
  sleep 1
  xdg-open "http://localhost:3001" &
elif command -v open &>/dev/null; then
  open "http://localhost:3000"
  sleep 1
  open "http://localhost:3001"
fi

echo ""
echo "✅ 测试环境已启动！按 Ctrl+C 停止所有服务器"
echo "   http://localhost:3000  ← 用户A"
echo "   http://localhost:3001  ← 用户B"

# 等待子进程
wait
