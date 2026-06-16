const fs = require('fs');
const zlib = require('zlib');

// 只包含服务器上缺失的文件（不包含已存在的 server.js、package.json 等）
const files = [
  'utils/persist.js',
  'utils/ratelimit.js',
  'services/auth.js',
  'services/project.js',
  'services/logger.js',
  'services/annotation.js',
  'public/shared.js',
  'public/i18n.js',
  'public/script-editor.js',
  'public/story-editor.js',
  'public/devices.js',
  'public/login.html',
  'public/default-avatar.png',
  'public/fenjing/index.html',
  'public/fenjing/assets/index-DSxpk27Y.js',
  'public/fenjing/assets/index-XptjBxIK.css',
];

let script = '#!/bin/bash\nset -e\nDST=/root/collab-studio/collab-studio\n';
for (const f of files) {
  const buf = fs.readFileSync(f);
  const b64 = buf.toString('base64');
  const dir = f.substring(0, f.lastIndexOf('/'));
  script += `mkdir -p $DST/${dir}\necho ${JSON.stringify(b64)} | base64 -d > $DST/${f}\necho "  OK ${f}"\n`;
}
script += 'cd $DST && export ADMIN_PASSWORD=Abdurahman666% && pkill -f "node server.js" 2>/dev/null; sleep 1; nohup node server.js > server.log 2>&1 &\nsleep 2\ncurl -s localhost:3000 | head -3\necho "\nDone! http://8.213.147.43:3000"\n';

const gz = zlib.gzipSync(Buffer.from(script));
const b64 = gz.toString('base64');
const cmd = `echo ${JSON.stringify(b64)} | base64 -d | gunzip | bash`;

fs.writeFileSync('deploy_cmd.txt', cmd, 'utf8');
console.log('Script raw:', (script.length/1024).toFixed(1), 'KB');
console.log('Compressed b64:', (cmd.length/1024).toFixed(1), 'KB');
console.log('Saved to deploy_cmd.txt');
