/**
 * 全量同步部署脚本
 * 将本地项目打包为 tar.gz → SFTP 上传 → 服务器解压 → 重启服务
 *
 * 使用方式: node deploy_sync.js
 */

// 自动安装依赖（如果缺失）
try {
  require.resolve('ssh2');
} catch (e) {
  console.log('📦 安装部署依赖 ssh2...');
  require('child_process').execSync('npm install ssh2', { stdio: 'inherit' });
  console.log('  ✅ 依赖安装完成\n');
}

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ====== 服务器配置 ======
const HOST = '8.213.147.43';
const USER = 'root';
const PASS = 'Abdurahman666%';
const DST = '/root/collab-studio/collab-studio';
const TMP_TAR = '/tmp/collab-studio.tar.gz';

// ====== 排除的文件/目录（glob 模式） ======
const EXCLUDE = [
  'node_modules',
  'data',
  '.git',
  '.admin.env',
  '.env',
  '*.log',
  'server.log',
  'resp.txt',
  'start.sh',
  'deploy_*.js',
  'upload_*.js',
  'list_remote*.js',
  'check_*.js',
  'fix_*.js',
  'debug_*.js',
  'restart*.js',
  'show_log.js',
  'test_*.js',
  'npm_install.js',
  'verify*.js',
  'start2.js',
  'start_server.js',
  'test.bat',
  'test.sh',
  'split_cmds.txt',
  'fix_node_cmd.txt',
];

// ====== Step 1: 本地打包 ======
console.log('📦 打包项目文件...');
const excludeArgs = EXCLUDE.map(e => `--exclude="${e}"`).join(' ');
const tarCmd = `tar czf /tmp/collab-studio.tar.gz ${excludeArgs} -C ${process.cwd()} .`;
console.log(`  $ ${tarCmd}`);
execSync(tarCmd, { stdio: 'inherit' });

const stats = fs.statSync('/tmp/collab-studio.tar.gz');
console.log(`  ✅ 打包完成: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

// ====== Step 2: SFTP 上传 ======
console.log('\n🔌 连接服务器...');
const conn = new Client();

conn.on('ready', () => {
  console.log('  ✅ 已连接');
  console.log('  ⬆️  上传 tar.gz...');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('❌ SFTP 错误:', err.message);
      conn.end();
      process.exit(1);
    }

    const startTime = Date.now();
    const buf = fs.readFileSync('/tmp/collab-studio.tar.gz');
    sftp.writeFile(TMP_TAR, buf, (err) => {
      if (err) {
        console.error('❌ 上传失败:', err.message);
        conn.end();
        process.exit(1);
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ✅ 上传完成 (${elapsed}s, ${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

      // ====== Step 3: 服务器解压 + 安装依赖 + 重启 ======
      console.log('\n⚙️  在服务器上部署...');
      const script = `#!/bin/bash
set -e
echo "  📂 解压文件..."
mkdir -p ${DST}
tar xzf ${TMP_TAR} -C ${DST}
rm -f ${TMP_TAR}
echo "  ✅ 解压完成"

echo "  📦 安装依赖..."
cd ${DST}
if [ -d node_modules ]; then
  echo "  node_modules 已存在，跳过 npm ci"
else
  npm ci --omit=dev
  echo "  ✅ 依赖安装完成"
fi

echo "  🔄  重启服务..."
OLDPID=$(pgrep -f "^node server" || echo "")
if [ -n "$OLDPID" ]; then
  echo "  旧 PID: $OLDPID, 正在停止..."
  kill $OLDPID 2>/dev/null || true
  sleep 2
fi
ADMIN_PASSWORD="${PASS}" nohup node server.js > server.log 2>&1 &
sleep 3
NEWPID=$(pgrep -f "^node server" || echo "")
if [ -n "$NEWPID" ]; then
  echo "  ✅ 服务已重启，PID: $NEWPID"
  echo ""
  echo "=== 启动日志 ==="
  tail -5 server.log
  echo "================"
  echo ""
  curl -s -o /dev/null -w "  HTTP 状态: %{http_code}\\n" http://localhost:3000/ 2>/dev/null || echo "  ⚠️  HTTP 检测超时"
else
  echo "  ❌ 服务启动失败，日志:"
  tail -20 server.log
fi
`;
      // 用 base64 编码避免换行符被 JSON.stringify 转义破坏
      const scriptB64 = Buffer.from(script).toString('base64');
      conn.exec(`echo ${JSON.stringify(scriptB64)} | base64 -d | bash`, (err2, stream) => {
        if (err2) {
          console.error('❌ 远程执行失败:', err2.message);
          conn.end();
          process.exit(1);
        }
        let output = '';
        stream.on('data', (d) => { output += d.toString(); process.stdout.write(d); });
        stream.stderr.on('data', (d) => { output += d.toString(); process.stderr.write(d); });
        stream.on('close', (code) => {
          console.log(`\n🏁 部署完成（退出码 ${code}）`);
          // 清理本地临时文件
          fs.unlinkSync('/tmp/collab-studio.tar.gz');
          conn.end();
        });
      });
    });
  });
});

conn.on('error', (err) => {
  console.error('❌ 连接失败:', err.message);
  console.log('\n💡 提示: 确认服务器 \`8.213.147.43\` 是否在线，或检查 SSH 配置');
  process.exit(1);
});

conn.connect({
  host: HOST,
  port: 22,
  username: USER,
  password: PASS,
  readyTimeout: 15000,
});
