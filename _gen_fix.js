const fs = require('fs');
const path = require('path');

// 所有需要部署的文件
const files = [
  'server.js',
  'package.json',
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
  'public/fenjing/index.html',
  'public/fenjing/assets/index-DSxpk27Y.js',
  'public/fenjing/assets/index-XptjBxIK.css',
  'services/auth.js',
  'services/project.js',
  'services/logger.js',
  'services/annotation.js',
  'utils/persist.js',
  'utils/ratelimit.js',
];

const parts = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const b64 = buf.toString('base64');
  parts.push(`{p:${JSON.stringify(f)},d:${JSON.stringify(b64)}}`);
}

const out = `// 将此脚本保存到服务器，然后运行: node fix.js
const fs=require('fs'),path=require('path'),files=[${parts.join(',')}];
files.forEach(f=>{const d=path.dirname(f.p);fs.mkdirSync(path.join('/root/collab-studio/collab-studio',d),{recursive:true});fs.writeFileSync(path.join('/root/collab-studio/collab-studio',f.p),Buffer.from(f.d,'base64'));console.log('OK',f.p)});
console.log('Done!');const{execSync}=require('child_process');execSync('cd /root/collab-studio/collab-studio && export ADMIN_PASSWORD=Abdurahman666% && nohup node server.js > server.log 2>&1 &');console.log('Server started');
`;

fs.writeFileSync('fix.js', out, 'utf8');
console.log('fix.js size:', (out.length / 1024).toFixed(1), 'KB');
