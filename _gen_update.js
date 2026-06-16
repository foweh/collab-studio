const fs = require('fs');
const path = require('path');

// 所有需要部署到服务器的文件
const files = [
  // 根目录
  'server.js',
  'package.json',
  // public/
  'public/index.html',
  'public/login.html',
  'public/style.css',
  'public/app.js',
  'public/shared.js',
  'public/i18n.js',
  'public/script-editor.js',
  'public/mindmap.js',
  'public/story-editor.js',
  'public/devices.js',
  'public/default-avatar.png',
  // public/fenjing/
  'public/fenjing/index.html',
  'public/fenjing/assets/index-DSxpk27Y.js',
  'public/fenjing/assets/index-XptjBxIK.css',
  // services/
  'services/auth.js',
  'services/project.js',
  'services/logger.js',
  'services/annotation.js',
  // utils/
  'utils/persist.js',
  'utils/ratelimit.js',
];

const DST = '/root/collab-studio/collab-studio';
const PASS = 'Abdurahman666%';

let script = `#!/bin/bash
# CollabStudio 部署脚本 - 自动生成
# 生成时间: ${new Date().toISOString()}
set -e
DST="${DST}"
echo "=== CollabStudio 部署 ==="
echo "解压 ${files.length} 个文件..."
echo ""
`;

// 检查所有文件是否存在
let errors = [];
for (const f of files) {
  if (!fs.existsSync(f)) {
    errors.push(`  ❌ 缺失: ${f}`);
  }
}
if (errors.length > 0) {
  console.log('以下文件缺失，请检查:');
  console.log(errors.join('\n'));
  process.exit(1);
}

for (const f of files) {
  const buf = fs.readFileSync(f);
  const b64 = buf.toString('base64');
  const outPath = path.posix.join('$DST', f);
  const outDir = path.posix.dirname(outPath);

  script += `
# ── ${f} ──
mkdir -p ${outDir}
echo "${b64}" | base64 -d > ${outPath}
echo "  ✅ ${f}"
`;
}

script += `
echo ""
echo "=== 重启服务 ==="
pkill -f 'node server.js' 2>/dev/null || true
sleep 1
cd $DST
export ADMIN_PASSWORD='${PASS}'
nohup node server.js > server.log 2>&1 &
sleep 2

echo ""
echo "=== 验证 ==="
curl -s http://localhost:3000 | head -3
echo ""
echo "=== 部署完成 ==="
echo "访问: http://8.213.147.43:3000"
echo "管理员: 热合曼  密码: ${PASS}"
`;

const outFile = '_update.sh';
fs.writeFileSync(outFile, script, 'utf8');

const sizeKB = (script.length / 1024).toFixed(1);
console.log(`✅ 已生成 ${outFile}`);
console.log(`   包含 ${files.length} 个文件`);
console.log(`   大小: ${sizeKB} KB`);
console.log('');
console.log('下一步:');
console.log('  1. 将 _update.sh 上传到服务器');
console.log('  2. 在服务器上运行: bash _update.sh');
