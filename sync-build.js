// ─── 同步构建脚本 ─────────────────────────────────────
// 结束三份 server.js 代码漂移：把主版后端代码同步到 android / installer 副本。
// 用法：node sync-build.js            （只同步，不改 package.json）
//       node sync-build.js --deps    （同步 + 合并 dependencies）
//
// 同步内容（仅后端核心，避免覆盖各副本的差异化静态资源）：
//   server.js
//   services/*.js      （含 ai.js，副本原本缺失）
//   utils/*.js
//
// 同步后三份 server.js 的 SHA-256 应一致。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SOURCE = {
  server: path.join(ROOT, 'server.js'),
  services: path.join(ROOT, 'services'),
  utils: path.join(ROOT, 'utils'),
};
const TARGETS = [
  {
    name: 'android',
    server: path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project', 'server.js'),
    services: path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project', 'services'),
    utils: path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project', 'utils'),
    pkg: path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'nodejs-project', 'package.json'),
  },
  {
    name: 'installer',
    server: path.join(ROOT, 'installer', 'app', 'server.js'),
    services: path.join(ROOT, 'installer', 'app', 'services'),
    utils: path.join(ROOT, 'installer', 'app', 'utils'),
    pkg: path.join(ROOT, 'installer', 'app', 'package.json'),
  },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function syncDir(srcDir, dstDir, label) {
  if (!fs.existsSync(srcDir)) { console.log(`  [跳过] ${label} 源目录不存在`); return; }
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
  fs.mkdirSync(dstDir, { recursive: true });
  for (const f of files) {
    copyFile(path.join(srcDir, f), path.join(dstDir, f));
    console.log(`  [同步] ${label}/${f}`);
  }
}

// 合并依赖：以主版 package.json 的 dependencies 为准，副本缺失的补上（不删除副本特有项）
function mergeDeps(pkgPath, mainDeps, label) {
  if (!fs.existsSync(pkgPath)) { console.log(`  [跳过] ${label} package.json 不存在`); return; }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const before = Object.keys(pkg.dependencies || {}).length;
  pkg.dependencies = Object.assign({}, pkg.dependencies || {}, mainDeps);
  const added = Object.keys(mainDeps).filter(d => !Object.prototype.hasOwnProperty.call(pkg.dependencies, d) || true);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const after = Object.keys(pkg.dependencies).length;
  const addedNames = Object.keys(mainDeps).filter(d => Object.keys(JSON.parse(JSON.stringify(pkg.dependencies))).includes(d));
  console.log(`  [依赖] ${label}: ${before} → ${after} 项 (补: ${addedNames.join(', ') || '无'})`);
}

function main() {
  const syncDeps = process.argv.includes('--deps');
  console.log('=== 同步构建: 主版 → android / installer ===\n');

  for (const t of TARGETS) {
    console.log(`--- ${t.name} ---`);
    copyFile(SOURCE.server, t.server);
    console.log(`  [同步] server.js`);
    syncDir(SOURCE.services, t.services, 'services');
    syncDir(SOURCE.utils, t.utils, 'utils');
    if (syncDeps) {
      const mainPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      mergeDeps(t.pkg, mainPkg.dependencies, t.name);
    }
    console.log('');
  }

  // 校验 hash
  console.log('=== 校验 server.js SHA-256 ===');
  const hashes = {};
  hashes.main = sha256(SOURCE.server);
  for (const t of TARGETS) hashes[t.name] = sha256(t.server);
  for (const [k, v] of Object.entries(hashes)) console.log(`  ${k.padEnd(10)} ${v}`);
  const allSame = Object.values(hashes).every(v => v === hashes.main);
  console.log(allSame ? '\n✅ 三份 server.js 完全一致' : '\n❌ server.js 仍有差异');
  process.exit(allSame ? 0 : 1);
}

main();
