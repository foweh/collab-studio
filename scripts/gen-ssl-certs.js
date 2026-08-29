// ─── HTTPS 自签名证书生成脚本 ─────────────────────────
// 用法：node scripts/gen-ssl-certs.js [域名/IP...]
// 默认生成 ssl/privkey.pem + ssl/cert.pem，供 server.js 自动加载启用 HTTPS。
// 依赖 openssl（Windows 10+ / macOS / Linux 标配，或官网安装）。
//
// 注意：自签名证书浏览器会提示不安全，首次访问需手动信任；
// 正式部署建议使用 Let's Encrypt 等受信任 CA 签发的证书。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(__dirname, '..', 'ssl');
const KEY_PATH = path.join(OUT_DIR, 'privkey.pem');
const CSR_PATH = path.join(OUT_DIR, 'server.csr');
const CERT_PATH = path.join(OUT_DIR, 'cert.pem');
const EXT_PATH = path.join(OUT_DIR, 'san.ext');

function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) names.push('localhost', '127.0.0.1');

  console.log('[ssl] 生成自签名证书...');
  console.log(`[ssl] SAN: ${names.join(', ')}`);

  // 检查 openssl 可用性
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch (e) {
    console.error('[ssl] ❌ 未找到 openssl。请安装 OpenSSL 后重试：');
    console.error('        Windows: https://slproweb.com/products/Win32OpenSSL.html');
    console.error('        macOS:   brew install openssl');
    console.error('        Linux:   apt install openssl / yum install openssl');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  try {
    // SAN 扩展：IP 字面量用 IP: 前缀，其余用 DNS: 前缀
    const sanParts = names.map(n => (/^\d+\.\d+\.\d+\.\d+$/.test(n) ? `IP:${n}` : `DNS:${n}`));
    fs.writeFileSync(EXT_PATH, `subjectAltName=${sanParts.join(',')}\n`);

    // 1. 私钥
    execFileSync('openssl', ['genrsa', '-out', KEY_PATH, '2048'], { stdio: 'inherit' });
    // 2. CSR
    execFileSync('openssl', ['req', '-new', '-key', KEY_PATH, '-out', CSR_PATH, '-subj', '/CN=localhost'], { stdio: 'inherit' });
    // 3. 自签名证书（含 SAN，10 年有效期）
    execFileSync('openssl', ['x509', '-req', '-in', CSR_PATH, '-signkey', KEY_PATH, '-out', CERT_PATH, '-days', '3650', '-extfile', EXT_PATH], { stdio: 'inherit' });
    // 4. 清理中间文件
    fs.rmSync(CSR_PATH, { force: true });
    fs.rmSync(EXT_PATH, { force: true });

    console.log('\n[ssl] ✅ 证书已生成：');
    console.log(`        私钥: ${KEY_PATH}`);
    console.log(`        证书: ${CERT_PATH}`);
    console.log('\n[ssl] 重启服务器即启用 HTTPS（443 端口），HTTP 3000 自动跳转 HTTPS。');
    console.log('[ssl] 提示：自签名证书浏览器会提示不安全，可点击"高级→继续访问"；');
    console.log('       局域网多设备使用建议每台设备信任一次该证书。');
  } catch (e) {
    console.error('[ssl] ❌ 生成失败:', e.message);
    process.exit(1);
  }
}

main();
