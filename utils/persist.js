// ─── 文件持久化工具 ──────────────────────────────────────
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    try { fs.chmodSync(DATA_DIR, 0o700); } catch (_) {}
  }
  return DATA_DIR;
}

function loadJSON(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw || raw.trim().length === 0) {
        console.warn(`[持久化] 空文件 ${path.basename(filePath)}，使用默认值`);
        return fallback;
      }
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`[持久化] 读取失败 ${path.basename(filePath)}:`, e.message);
    // 备份损坏文件
    try {
      const bakPath = filePath + '.corrupted.' + Date.now();
      fs.copyFileSync(filePath, bakPath);
      console.warn(`[持久化] 已备份损坏文件到 ${path.basename(bakPath)}`);
    } catch (_) {}
  }
  return fallback;
}

function saveJSON(filePath, data) {
  try {
    const tmpPath = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    try { fs.chmodSync(tmpPath, 0o600); } catch (_) {}
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error(`[持久化] 写入失败 ${path.basename(filePath)}:`, e.message);
  }
}

module.exports = { ensureDataDir, loadJSON, saveJSON, DATA_DIR };
