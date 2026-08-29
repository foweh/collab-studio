// ─── 文件持久化工具 ──────────────────────────────────────
const fs = require('fs');
const path = require('path');

// 支持通过 DATA_DIR 环境变量自定义数据目录（多实例测试、便携运行等场景）
const BASE_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : (process.pkg
      ? path.dirname(process.execPath)
      : path.join(__dirname, '..'));
const DATA_DIR = path.join(BASE_DIR, 'data');

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

// 每个文件的写入队列，防止并发写入导致数据错乱
const _writeQueues = new Map();

function saveJSON(filePath, data) {
  const key = path.resolve(filePath);
  // 加入队列：把数据缓存到最新值，批量异步写入
  if (!_writeQueues.has(key)) {
    _writeQueues.set(key, { pending: null, writing: false });
  }
  const q = _writeQueues.get(key);
  q.pending = data;
  if (!q.writing) {
    q.writing = true;
    // 下一个事件循环 tick 再写入，合并同一 tick 内的多次 saveJSON 调用
    setImmediate(() => {
      q.writing = false;
      const d = q.pending;
      q.pending = null;
      if (d === null) return;
      const tmpPath = filePath + '.tmp.' + process.pid;
      // 异步写入，不阻塞事件循环
      fs.writeFile(tmpPath, JSON.stringify(d, null, 2), 'utf-8', (err) => {
        if (err) {
          console.error(`[持久化] 写入失败 ${path.basename(filePath)}:`, err.message);
          return;
        }
        try { fs.chmodSync(tmpPath, 0o600); } catch (_) {}
        fs.rename(tmpPath, filePath, (err2) => {
          if (err2) console.error(`[持久化] 重命名失败 ${path.basename(filePath)}:`, err2.message);
        });
      });
    });
  }
}

module.exports = { ensureDataDir, loadJSON, saveJSON, DATA_DIR };
